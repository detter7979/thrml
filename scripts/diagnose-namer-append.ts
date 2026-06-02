/**
 * Diagnose why approved creatives may not appear in the namer sheet.
 *
 * Usage: npx tsx scripts/diagnose-namer-append.ts [--retry ASSET_ID]
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"

import {
  appendApprovedCreativeToNamer,
  resolveNamerSheetId,
  THRML_NAMER_V4_SHEET_ID,
} from "@/lib/agent/namer-creative-append"
import {
  createGoogleSheetsClient,
  listSpreadsheetTabs,
  resolveTabTitle,
} from "@/lib/agent/google-sheets-client"

config({ path: ".env.local" })

const V4_SHEET_ID = THRML_NAMER_V4_SHEET_ID
const LEGACY_SHEET_ID = "1yx5cxxno8Pig23Zs6GagF0EblImIUQqy1fv6e4Rfh3o"

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function main() {
  const retryAssetId = process.argv.includes("--retry")
    ? process.argv[process.argv.indexOf("--retry") + 1]
    : null

  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  )

  const resolvedSheetId = await resolveNamerSheetId(admin)
  console.log("\n=== Namer config ===")
  console.log("NAMER_SHEET_ID:", process.env.NAMER_SHEET_ID?.trim() || "(unset)")
  console.log("GDRIVE_NAMER_SHEET_ID:", process.env.GDRIVE_NAMER_SHEET_ID?.trim() || "(unset)")
  console.log("Resolved sheet ID:", resolvedSheetId || "(none — append will skip silently)")
  console.log("Expected thrml_namer_v4:", V4_SHEET_ID)
  console.log("Legacy scripts sheet:", LEGACY_SHEET_ID)
  if (resolvedSheetId && resolvedSheetId !== V4_SHEET_ID) {
    console.log("⚠️  Resolved ID does not match thrml_namer_v4 URL you shared")
  }
  if (!resolvedSheetId) {
    console.log("⚠️  Set NAMER_SHEET_ID=" + V4_SHEET_ID + " on Vercel (and .env.local)")
  }

  console.log("\n=== Recent approved assets ===")
  const { data: assets, error } = await admin
    .from("creative_assets")
    .select(
      "id, status, convention_name, approved_at, namer_synced_at, namer_export_gcs_path, created_at"
    )
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(8)

  if (error) {
    console.log("Query failed:", error.message)
    if (error.message.includes("namer_synced_at")) {
      console.log("⚠️  Run migration 20260529120000_creative_assets_namer_synced.sql on Supabase")
    }
    return
  }

  if (!assets?.length) {
    console.log("No approved assets found.")
    return
  }

  for (const a of assets) {
    console.log(
      `- ${a.id.slice(0, 8)}… | convention: ${a.convention_name ?? "MISSING"} | namer_synced_at: ${a.namer_synced_at ?? "never"}`
    )
  }

  if (resolvedSheetId && process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const sheets = createGoogleSheetsClient()
      const tabs = await listSpreadsheetTabs(sheets, resolvedSheetId)
      const tab = resolveTabTitle(tabs, "④ Creative Builder", "Creative Builder")
      console.log("\n=== Sheet access ===")
      console.log("Tabs:", tabs.join(" | "))
      console.log("Creative Builder tab:", tab ?? "(not found)")
    } catch (err) {
      console.log("\n=== Sheet access FAILED ===")
      console.log(err instanceof Error ? err.message : err)
      console.log("Share the sheet with thrml-agent@watchful-muse-350902.iam.gserviceaccount.com as Editor")
    }
  }

  const targetId = retryAssetId ?? assets[0]?.id
  if (targetId && process.argv.includes("--retry")) {
    console.log(`\n=== Retrying append for ${targetId} ===`)
    const result = await appendApprovedCreativeToNamer(admin, targetId)
    console.log(JSON.stringify(result, null, 2))
  } else if (targetId) {
    console.log(`\nRun with --retry ${targetId} to test append after fixing env`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
