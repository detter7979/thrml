/**
 * Live DB audit: RLS exposure smoke tests + waiver version capture verification.
 * Usage: ENV_FILE=.env.production npx tsx scripts/audit-rls-and-waivers.ts
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

function loadEnvFile(filename: string) {
  const path = resolve(process.cwd(), filename)
  const raw = readFileSync(path, "utf8")
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

const envFile = process.env.ENV_FILE ?? ".env.production"
loadEnvFile(envFile)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !anonKey || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const anon = createClient(url, anonKey, { auth: { persistSession: false } })
const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

type ProbeResult = {
  table: string
  role: "anon" | "service"
  selectCount: number | null
  error: string | null
  sampleKeys: string[]
  leakedSensitive: boolean
}

const PII_TABLES = [
  "profiles",
  "bookings",
  "messages",
  "conversations",
  "support_requests",
  "email_log",
  "financial_events",
  "stripe_disputes",
  "user_credits",
  "credit_ledger",
  "incident_reports",
  "guest_reviews",
  "guest_ratings",
  "booked_slots",
] as const

const PUBLIC_OK_TABLES = [
  "listings",
  "listing_photos",
  "availability",
  "listing_blackout_dates",
  "listing_reviews",
  "reviews",
  "waiver_templates",
  "public_profiles",
] as const

const SENSITIVE_PROFILE_KEYS = [
  "phone",
  "email",
  "stripe_account_id",
  "stripe_customer_id",
  "is_admin",
  "referral_credit_cents",
  "is_banned",
]

const HARDENING_POLICIES: Record<string, string[]> = {
  listings: [
    "listings_public_select_active",
    "listings_host_insert_own",
    "listings_host_update_own",
    "listings_host_delete_own",
  ],
  bookings: [
    "bookings_guest_select_own",
    "bookings_host_select_own_listing",
    "bookings_guest_insert_self",
  ],
  profiles: ["profiles_self_select", "profiles_self_insert", "profiles_self_update"],
  reviews: ["reviews_public_select_published", "reviews_insert_completed_booking_user"],
  listing_reviews: [
    "listing_reviews_public_select_published",
    "listing_reviews_insert_completed_booking_user",
  ],
  conversations: ["conversations_participant_select", "conversations_participant_insert"],
  messages: ["messages_participant_select", "messages_participant_insert_sender_self"],
  availability: ["availability_public_select_active_listing", "availability_host_crud_own"],
  listing_photos: [
    "listing_photos_public_select_active_listing",
    "listing_photos_host_crud_own",
  ],
  listing_blackout_dates: [
    "listing_blackout_dates_public_select_active_listing",
    "listing_blackout_dates_host_crud_own",
  ],
  waiver_templates: ["waiver_templates_public_active"],
  support_requests: ["support_requests_public_insert_only"],
  booked_slots: ["booked_slots_host_guest_select_only"],
}

async function probeTable(
  client: SupabaseClient,
  table: string,
  role: "anon" | "service",
  columns = "*"
): Promise<ProbeResult> {
  const { data, error, count } = await client
    .from(table)
    .select(columns, { count: "exact", head: false })
    .limit(3)

  const rows = Array.isArray(data) ? data : []
  const sampleKeys = rows.length > 0 && rows[0] && typeof rows[0] === "object"
    ? Object.keys(rows[0] as Record<string, unknown>)
    : []

  const leakedSensitive =
    table === "profiles" &&
    rows.some((row) =>
      SENSITIVE_PROFILE_KEYS.some((k) => k in (row as Record<string, unknown>))
    )

  return {
    table,
    role,
    selectCount: error ? null : count ?? rows.length,
    error: error?.message ?? null,
    sampleKeys,
    leakedSensitive,
  }
}

async function main() {
  console.log(`\n=== Live DB audit (${envFile}) ===\n`)

  // 1. Anon PII exposure probes
  console.log("--- Anon SELECT probes (PII tables should return 0 rows or error) ---")
  const piiProbes: ProbeResult[] = []
  for (const table of PII_TABLES) {
    piiProbes.push(await probeTable(anon, table, "anon"))
  }
  for (const r of piiProbes) {
    const status =
      r.error && /permission denied|row-level security|42501/i.test(r.error)
        ? "PASS (RLS blocked)"
        : r.selectCount === 0
          ? "PASS (0 rows)"
          : r.leakedSensitive
            ? "FAIL (PII LEAK)"
            : r.selectCount && r.selectCount > 0
              ? "WARN (rows returned — review)"
              : "UNKNOWN"
    console.log(
      `${r.table.padEnd(22)} ${status.padEnd(22)} count=${r.selectCount ?? "n/a"} keys=${r.sampleKeys.slice(0, 6).join(",")}`
    )
    if (r.error) console.log(`  error: ${r.error}`)
  }

  // 2. Public tables sanity
  console.log("\n--- Anon SELECT probes (intentionally public tables) ---")
  for (const table of PUBLIC_OK_TABLES) {
    const r = await probeTable(anon, table, "anon", table === "public_profiles" ? "id,full_name" : "id")
    const ok = r.error ? `ERR: ${r.error}` : `count=${r.selectCount ?? 0}`
    console.log(`${table.padEnd(22)} ${ok}`)
  }

  // 3. public_profiles vs profiles sensitive column check
  console.log("\n--- profiles vs public_profiles column exposure (anon) ---")
  const profilesAnon = await anon.from("profiles").select("*").limit(1)
  const publicProfilesAnon = await anon.from("public_profiles").select("*").limit(1)
  console.log(
    `profiles anon: ${profilesAnon.error ? `blocked (${profilesAnon.error.message})` : `LEAK ${profilesAnon.data?.length ?? 0} rows`}`
  )
  if (profilesAnon.data?.[0]) {
    const keys = Object.keys(profilesAnon.data[0] as object)
    const sensitive = keys.filter((k) => SENSITIVE_PROFILE_KEYS.includes(k))
    if (sensitive.length) console.log(`  SENSITIVE KEYS EXPOSED: ${sensitive.join(", ")}`)
  }
  console.log(
    `public_profiles anon: ${publicProfilesAnon.error ? `error (${publicProfilesAnon.error.message})` : `${publicProfilesAnon.data?.length ?? 0} sample rows OK`}`
  )

  // 4. Waiver templates live versions
  console.log("\n--- Waiver templates (active versions in live DB) ---")
  const { data: templates, error: tmplErr } = await admin
    .from("waiver_templates")
    .select("service_type, version, is_active, created_at")
    .eq("is_active", true)
    .order("service_type")

  if (tmplErr) {
    console.log(`ERROR: ${tmplErr.message}`)
  } else {
    const versions = new Set<string>()
    for (const t of templates ?? []) {
      versions.add(String(t.version))
      console.log(`  ${String(t.service_type).padEnd(18)} ${t.version}`)
    }
    console.log(`\nDistinct active versions: ${[...versions].join(", ") || "(none)"}`)
    if (!versions.has("v1.1-2026-05")) {
      console.log("NOTE: v1.1-2026-05 not found among active templates — check if prod was updated.")
    }
  }

  // 5. Booking waiver capture stats
  console.log("\n--- Booking waiver_version capture (service role) ---")
  const { data: bookingStats } = await admin
    .from("bookings")
    .select("id, waiver_version, waiver_accepted, waiver_accepted_at, created_at, status")
    .order("created_at", { ascending: false })
    .limit(500)

  const rows = bookingStats ?? []
  const withVersion = rows.filter(
    (b) => typeof b.waiver_version === "string" && b.waiver_version.trim().length > 0
  )
  const withAcceptedAt = rows.filter((b) => typeof b.waiver_accepted_at === "string")
  const missingVersion = rows.filter(
    (b) => !b.waiver_version || !String(b.waiver_version).trim()
  )
  const recent = rows.slice(0, 5)

  console.log(`Sample size (latest 500 bookings): ${rows.length}`)
  console.log(`  with waiver_version string: ${withVersion.length}`)
  console.log(`  with waiver_accepted_at:    ${withAcceptedAt.length}`)
  console.log(`  missing waiver_version:     ${missingVersion.length}`)

  if (recent.length) {
    console.log("\n  Latest bookings:")
    for (const b of recent) {
      console.log(
        `    ${String(b.id).slice(0, 8)}… status=${b.status} version=${b.waiver_version ?? "(null)"} accepted_at=${b.waiver_accepted_at ?? "(null)"}`
      )
    }
  }

  const versionCounts: Record<string, number> = {}
  for (const b of withVersion) {
    const v = String(b.waiver_version).trim()
    versionCounts[v] = (versionCounts[v] ?? 0) + 1
  }
  if (Object.keys(versionCounts).length) {
    console.log("\n  waiver_version distribution (in sample):")
    for (const [v, n] of Object.entries(versionCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${v}: ${n}`)
    }
  }

  // 6. Policy name inference via pg_policies RPC if available
  console.log("\n--- Expected hardening policies (requires SQL RPC; skipped if unavailable) ---")
  const { data: policyRows, error: policyErr } = await admin.rpc("audit_pg_policies" as never)
  if (policyErr) {
    console.log(`  pg_policies RPC not available (${policyErr.message})`)
    console.log("  Expected policy names from db/security-rls-hardening.sql:")
    for (const [table, policies] of Object.entries(HARDENING_POLICIES)) {
      console.log(`    ${table}: ${policies.join(", ")}`)
    }
  } else {
    console.log(policyRows)
  }

  // Summary
  const failures = piiProbes.filter(
    (r) =>
      !r.error &&
      (r.selectCount ?? 0) > 0 &&
      (r.leakedSensitive || r.table === "profiles")
  )
  console.log("\n=== SUMMARY ===")
  if (failures.length === 0) {
    console.log("RLS smoke: No obvious anon PII leaks detected.")
  } else {
    console.log(`RLS smoke: ${failures.length} table(s) may be exposed to anon — review above.`)
  }
  const waiverOk =
    rows.length === 0 ||
    (withVersion.length > 0 && missingVersion.length === 0) ||
    (withVersion.length / Math.max(rows.length, 1) >= 0.95)
  console.log(
    waiverOk
      ? "Waiver capture: waiver_version populated on recent bookings."
      : "Waiver capture: some bookings missing waiver_version — investigate checkout flow timing."
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
