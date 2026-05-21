/**
 * Finance ledger smoke test — verifies tables, recent events, and promo credit balances.
 *
 * Usage:
 *   npx tsx scripts/finance-smoke.ts
 */
import { createClient } from "@supabase/supabase-js"

import { loadEnvLocal } from "./lib/load-env-local"

loadEnvLocal()

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name} (set in .env.local or shell)`)
  return value
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createClient(url, key, { auth: { persistSession: false } })

  console.log("\n── thrml finance smoke test ──\n")

  const tables = ["financial_events", "stripe_disputes", "finance_snapshots"] as const
  for (const table of tables) {
    const { error, count } = await admin.from(table).select("*", { count: "exact", head: true })
    if (error) {
      console.log(`✗ ${table}: ${error.message}`)
    } else {
      console.log(`✓ ${table} reachable (${count ?? 0} rows)`)
    }
  }

  const { data: rpcCheck, error: rpcError } = await admin.rpc("restore_booking_promo_credits", {
    p_booking_id: "00000000-0000-0000-0000-000000000000",
  })
  if (rpcError) {
    console.log(`✗ restore_booking_promo_credits RPC: ${rpcError.message}`)
  } else {
    const payload = rpcCheck as { ok?: boolean; error?: string }
    console.log(
      `✓ restore_booking_promo_credits RPC (${payload?.ok === false ? payload.error : "callable"})`
    )
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: events } = await admin
    .from("financial_events")
    .select("event_type, amount_cents, occurred_at, source, booking_id")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(20)

  console.log(`\nRecent financial_events (7d, up to 20):`)
  if (!events?.length) {
    console.log("  (none — confirm a booking or run finance-backfill.ts)")
  } else {
    for (const e of events) {
      const dollars = (Number(e.amount_cents) / 100).toFixed(2)
      console.log(
        `  ${e.occurred_at?.slice(0, 10)}  ${e.event_type.padEnd(22)}  $${dollars}  ${e.source}`
      )
    }
  }

  const { data: snapshots, error: snapError } = await admin
    .from("finance_snapshots")
    .select("snapshot_date, net_platform_revenue, refunds_issued, credits_applied")
    .order("snapshot_date", { ascending: false })
    .limit(3)

  console.log(`\nLatest finance_snapshots:`)
  if (snapError) {
    console.log(`  ✗ query failed: ${snapError.message}`)
    console.log("  → Re-run migration 20260524120000_financial_ledger.sql if credits_applied is missing")
  } else if (!snapshots?.length) {
    console.log("  (none — run the agent-finance cron or wait for daily job)")
  } else {
    for (const s of snapshots) {
      console.log(
        `  ${s.snapshot_date}  net=$${Number(s.net_platform_revenue).toFixed(2)}  refunds=$${Number(s.refunds_issued).toFixed(2)}  credits=$${Number(s.credits_applied ?? 0).toFixed(2)}`
      )
    }
  }

  const { data: liability } = await admin.from("profiles").select("referral_credit_cents")
  const referralLiabilityCents = (liability ?? []).reduce(
    (s, r) => s + Math.max(0, Number(r.referral_credit_cents ?? 0)),
    0
  )
  const { data: userCredits } = await admin.from("user_credits").select("balance")
  const adminCreditLiabilityCents = (userCredits ?? []).reduce(
    (s, r) => s + Math.max(0, Number(r.balance ?? 0)),
    0
  )

  console.log(`\nOutstanding promo liability:`)
  console.log(`  Referral wallets: $${(referralLiabilityCents / 100).toFixed(2)}`)
  console.log(`  Admin credits:    $${(adminCreditLiabilityCents / 100).toFixed(2)}`)

  console.log("\nDone.\n")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
