/**
 * Manual Namer sheet appender. Pulls creative_assets with convention_name
 * created since a cutoff and appends rows to the Namer Google Sheet.
 *
 * Usage:
 *   npx tsx scripts/sync-namer.ts
 *   npx tsx scripts/sync-namer.ts --since 2026-05-01
 *   npx tsx scripts/sync-namer.ts --dry-run
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { google } from "googleapis"

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function loadCredentials() {
  const raw = requireEnv("GOOGLE_SERVICE_ACCOUNT_JSON")
  try {
    return JSON.parse(raw)
  } catch {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"))
  }
}

async function resolveNamerSheetId(supabase: SupabaseClient) {
  if (process.env.GDRIVE_NAMER_SHEET_ID?.trim()) {
    return process.env.GDRIVE_NAMER_SHEET_ID.trim()
  }

  const { data, error } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "gdrive_namer_sheet_id")
    .maybeSingle()

  if (error) throw error
  const value = (data as { value?: unknown } | null)?.value
  if (typeof value === "string" && value.trim()) return value.trim()
  if (value && typeof value === "object" && "sheetId" in value) {
    const sheetId = (value as { sheetId?: string }).sheetId
    if (sheetId?.trim()) return sheetId.trim()
  }

  throw new Error("Set GDRIVE_NAMER_SHEET_ID or platform_settings.gdrive_namer_sheet_id")
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const isDryRun = args.includes("--dry-run")
  const sinceIndex = args.indexOf("--since")
  const sinceArg = sinceIndex >= 0 ? args[sinceIndex + 1] : undefined
  const since =
    sinceArg && sinceArg !== "--dry-run"
      ? new Date(sinceArg)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  )

  const { data: assets, error } = await supabase
    .from("creative_assets")
    .select("id, brief_id, convention_name, gcs_path, gcs_url, variation_label, created_at")
    .not("convention_name", "is", null)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true })

  if (error) throw error
  if (!assets?.length) {
    console.log(`No assets to sync (since ${since.toISOString()})`)
    return
  }

  console.log(`Found ${assets.length} assets to sync`)

  const rows = assets.map((a) => [
    a.created_at,
    a.convention_name,
    a.variation_label ?? "",
    a.brief_id,
    a.gcs_path ?? a.gcs_url ?? "",
    a.id,
  ])

  if (isDryRun) {
    console.log("Dry run — rows that would be appended:")
    rows.forEach((r) => console.log(r.join(" | ")))
    return
  }

  const sheetId = await resolveNamerSheetId(supabase)
  const tab = process.env.NAMER_SHEET_TAB?.trim() || "Ads"

  const auth = new google.auth.GoogleAuth({
    credentials: loadCredentials(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  const sheets = google.sheets({ version: "v4", auth })

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab}!A:F`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  })

  console.log(`Appended ${rows.length} rows to ${tab}`)
}

main().catch((err) => {
  console.error("sync-namer failed:", err)
  process.exit(1)
})
