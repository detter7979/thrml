/**
 * Sync finance_snapshots → Finance Tracker "Marketplace Data" tab
 * and patch Executive Summary formulas.
 *
 * Usage:
 *   npx tsx scripts/sync-marketplace-finance-sheet.ts
 *
 * Requires GOOGLE_SERVICE_ACCOUNT_JSON and Supabase service role.
 * Optional: FINANCE_TRACKER_SHEET_ID (defaults to Finance Tracker master)
 */
import { createClient } from "@supabase/supabase-js"

import { syncMarketplaceFinanceSheet } from "../src/lib/finance/sync-marketplace-sheet"
import { loadEnvLocal } from "./lib/load-env-local"

loadEnvLocal()

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function main() {
  requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  requireEnv("SUPABASE_SERVICE_ROLE_KEY")

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const result = await syncMarketplaceFinanceSheet(admin)
  console.log(`✓ Synced ${result.rows} snapshot rows`)
  console.log(`✓ Rebuilt P&L Dashboard + Executive Summary`)
  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${result.spreadsheetId}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
