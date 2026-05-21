/**
 * Rebuild finance_snapshots from bookings + financial_events (idempotent upsert).
 *
 * Usage:
 *   npx tsx scripts/finance-rebuild-snapshots.ts --dry-run
 *   npx tsx scripts/finance-rebuild-snapshots.ts
 *   npx tsx scripts/finance-rebuild-snapshots.ts --since 2026-01-01
 */
import { createClient } from "@supabase/supabase-js"

import {
  buildDailyFinanceSnapshot,
  listFinanceActivityDates,
} from "../src/lib/finance/snapshot-builder"
import { loadEnvLocal } from "./lib/load-env-local"

loadEnvLocal()

function hasFlag(flag: string) {
  return process.argv.includes(flag)
}

function arg(flag: string) {
  const idx = process.argv.indexOf(flag)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function main() {
  const dryRun = hasFlag("--dry-run")
  const since = arg("--since")

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createClient(url, key, { auth: { persistSession: false } })

  const dates = await listFinanceActivityDates(admin, { since })
  console.log(`\nRebuild finance_snapshots — ${dates.length} day(s)${dryRun ? " (dry run)" : ""}\n`)

  if (!dates.length) {
    console.log("No activity dates found.\n")
    return
  }

  let totalNet = 0
  let totalRefunds = 0
  let totalGmv = 0

  for (const date of dates) {
    const snapshot = await buildDailyFinanceSnapshot(admin, date)
    totalNet += snapshot.net_platform_revenue
    totalRefunds += snapshot.refunds_issued
    totalGmv += snapshot.gross_booking_value

    console.log(
      `  ${date}  bookings=${snapshot.booking_count}  gmv=$${snapshot.gross_booking_value.toFixed(2)}  net=$${snapshot.net_platform_revenue.toFixed(2)}  refunds=$${snapshot.refunds_issued.toFixed(2)}`
    )

    if (!dryRun) {
      const { error } = await admin.from("finance_snapshots").upsert(snapshot, {
        onConflict: "snapshot_date",
      })
      if (error) throw error
    }
  }

  console.log(
    `\nTotals: GMV=$${totalGmv.toFixed(2)}  refunds=$${totalRefunds.toFixed(2)}  net platform=$${totalNet.toFixed(2)}`
  )
  if (dryRun) console.log("Re-run without --dry-run to write.\n")
  else console.log("Done.\n")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
