/**
 * Reconcile bookings vs financial_events and flag gaps.
 *
 * Usage:
 *   npx tsx scripts/finance-reconcile.ts
 *   npx tsx scripts/finance-reconcile.ts --since 2026-01-01
 */
import { createClient } from "@supabase/supabase-js"

import {
  cashPlatformTakeCents,
  dollarsFromCents,
  grossPlatformTakeCents,
} from "../src/lib/finance/booking-economics"
import {
  bookingRefundedDollars,
  loadBookingsForFinance,
} from "./lib/booking-finance"
import { loadEnvLocal } from "./lib/load-env-local"

loadEnvLocal()

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
  const since = arg("--since")

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createClient(url, key, { auth: { persistSession: false } })

  const rows = await loadBookingsForFinance(admin, { since })
  const { data: events, error: eErr } = await admin
    .from("financial_events")
    .select("event_type, amount_cents, booking_id")

  if (eErr) {
    if (eErr.code === "PGRST205" || eErr.message.includes("financial_events")) {
      console.error("\n✗ financial_events table not visible to the API yet.")
      console.error("  Re-run supabase/migrations/20260524120000_financial_ledger.sql")
      console.error("  Then in SQL editor: NOTIFY pgrst, 'reload schema';\n")
      process.exit(1)
    }
    throw eErr
  }
  const ledger = events ?? []

  const captureByBooking = new Set(
    ledger.filter((e) => e.event_type === "booking_capture" && e.booking_id).map((e) => e.booking_id)
  )
  const refundByBooking = new Map<string, number>()
  for (const e of ledger) {
    if (e.event_type !== "refund" || !e.booking_id) continue
    refundByBooking.set(
      e.booking_id,
      (refundByBooking.get(e.booking_id) ?? 0) + Math.abs(Number(e.amount_cents ?? 0))
    )
  }

  let missingCapture = 0
  let refundMismatch = 0
  let expectedCashTakeCents = 0
  let ledgerCashTakeCents = 0
  let expectedRefundsCents = 0

  console.log("\n── thrml finance reconciliation ──\n")
  if (since) console.log(`Scope: bookings since ${since}\n`)

  for (const row of rows) {
    const bookingId = String(row.id)
    const paid = row.status === "confirmed" || row.status === "completed"
    if (paid && row.stripe_payment_intent_id && !captureByBooking.has(bookingId)) {
      missingCapture += 1
      console.log(`  MISSING capture  ${bookingId.slice(0, 8)}  status=${row.status}`)
    }
    if (paid) {
      expectedCashTakeCents += cashPlatformTakeCents(row)
    }

    const bookingRefundCents = Math.round(bookingRefundedDollars(row) * 100)
    if (bookingRefundCents > 0) {
      expectedRefundsCents += bookingRefundCents
      const ledgerRefund = refundByBooking.get(bookingId) ?? 0
      if (Math.abs(ledgerRefund - bookingRefundCents) > 1) {
        refundMismatch += 1
        console.log(
          `  REFUND mismatch ${bookingId.slice(0, 8)}  booking=$${(bookingRefundCents / 100).toFixed(2)}  ledger=$${(ledgerRefund / 100).toFixed(2)}`
        )
      }
    }
  }

  for (const e of ledger) {
    if (e.event_type === "booking_capture") {
      ledgerCashTakeCents += Number(e.amount_cents ?? 0)
    }
  }

  const grossTake = rows
    .filter((r) => r.status === "confirmed" || r.status === "completed")
    .reduce((s, r) => s + grossPlatformTakeCents(r), 0)

  console.log("\nTotals (confirmed/completed):")
  console.log(`  Gross platform take (fees):     $${dollarsFromCents(grossTake).toFixed(2)}`)
  console.log(`  Expected cash take (bookings): $${dollarsFromCents(expectedCashTakeCents).toFixed(2)}`)
  console.log(`  Ledger cash take (captures):   $${dollarsFromCents(ledgerCashTakeCents).toFixed(2)}`)
  console.log(`  Expected refunds (bookings):   $${(expectedRefundsCents / 100).toFixed(2)}`)

  const ledgerRefunds = ledger
    .filter((e) => e.event_type === "refund")
    .reduce((s, e) => s + Math.abs(Number(e.amount_cents ?? 0)), 0)
  console.log(`  Ledger refunds:                $${(ledgerRefunds / 100).toFixed(2)}`)

  console.log("\nIssues:")
  console.log(`  Missing captures: ${missingCapture}`)
  console.log(`  Refund mismatches: ${refundMismatch}`)

  if (missingCapture > 0) {
    console.log("\n→ Run: npx tsx scripts/finance-backfill.ts\n")
  } else if (refundMismatch === 0) {
    console.log("\n✓ No gaps detected in scope.\n")
  } else {
    console.log("\n→ Review mismatches; run finance-backfill.ts if ledger is behind.\n")
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
