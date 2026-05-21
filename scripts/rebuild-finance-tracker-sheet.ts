/**
 * Rebuild P&L Dashboard + Executive Summary tabs on the Finance Tracker.
 * Optionally copies Platform Data from the Master Report first.
 *
 *   npm run finance:rebuild-sheet
 */
import { createClient } from "@supabase/supabase-js"

import { rebuildFinanceTrackerFromAdmin } from "../src/lib/finance/rebuild-finance-tracker"
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

  const result = await rebuildFinanceTrackerFromAdmin(admin)
  console.log("✓ Finance tracker rebuilt")
  console.log(`  Platform rows synced: ${result.platformRowsSynced}`)
  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${result.spreadsheetId}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
