/**
 * Backfill financial_events from historical bookings (idempotent).
 *
 * Usage:
 *   npx tsx scripts/finance-backfill.ts --dry-run
 *   npx tsx scripts/finance-backfill.ts
 *   npx tsx scripts/finance-backfill.ts --since 2026-01-01
 */
import { createClient } from "@supabase/supabase-js"

import {
  cashPlatformTakeCents,
  dollarsFromCents,
  promoCreditsAppliedCents,
} from "../src/lib/finance/booking-economics"
import { recordFinancialEvent } from "../src/lib/finance/events"
import {
  bookingPromoCreditsCents,
  bookingRefundedAt,
  bookingRefundedDollars,
  bookingStripeRefundId,
  loadBookingsForFinance,
} from "./lib/booking-finance"
import { loadEnvLocal } from "./lib/load-env-local"

loadEnvLocal()

function arg(flag: string) {
  const idx = process.argv.indexOf(flag)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

function hasFlag(flag: string) {
  return process.argv.includes(flag)
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

  const rows = await loadBookingsForFinance(admin, { since })
  console.log(`\nFinance backfill — ${rows.length} bookings${dryRun ? " (dry run)" : ""}\n`)

  let captures = 0
  let subsidies = 0
  let refunds = 0
  let skipped = 0

  for (const row of rows) {
    const bookingId = String(row.id)
    const piId =
      typeof row.stripe_payment_intent_id === "string" ? row.stripe_payment_intent_id : null
    const isPaid = row.status === "confirmed" || row.status === "completed"

    if (isPaid && piId) {
      const { data: existingCapture } = await admin
        .from("financial_events")
        .select("id")
        .eq("event_type", "booking_capture")
        .eq("stripe_object_id", piId)
        .maybeSingle()

      if (!existingCapture?.id) {
        const totalCents = Math.round(Number(row.total_charged ?? 0) * 100)
        const hostCents = Math.round(Number(row.host_payout ?? 0) * 100)
        const promoCents = bookingPromoCreditsCents(row) || promoCreditsAppliedCents(row)
        const platformCash = cashPlatformTakeCents(row)

        console.log(
          `  + capture  ${bookingId.slice(0, 8)}  cash_take=$${dollarsFromCents(platformCash)}  promo=$${(promoCents / 100).toFixed(2)}`
        )

        if (!dryRun) {
          await recordFinancialEvent(admin, {
            eventType: "booking_capture",
            amountCents: platformCash,
            bookingId,
            userId: typeof row.guest_id === "string" ? row.guest_id : null,
            stripeObjectId: piId,
            source: "finance_backfill",
            occurredAt:
              typeof row.updated_at === "string" ? row.updated_at : row.created_at ?? undefined,
            metadata: { total_charged_cents: totalCents, host_payout_cents: hostCents },
          })
          if (promoCents > 0) {
            await recordFinancialEvent(admin, {
              eventType: "credit_subsidy",
              amountCents: -promoCents,
              bookingId,
              userId: typeof row.guest_id === "string" ? row.guest_id : null,
              stripeObjectId: `${piId}_subsidy`,
              source: "finance_backfill",
              metadata: { promo_credits_cents: promoCents },
            })
            subsidies += 1
          }
        }
        captures += 1
      } else {
        skipped += 1
      }
    }

    const refunded = bookingRefundedDollars(row)
    if (refunded > 0) {
      const refundObjectId =
        bookingStripeRefundId(row) ?? `backfill_refund_${bookingId}`

      const { data: existingRefund } = await admin
        .from("financial_events")
        .select("id")
        .eq("event_type", "refund")
        .eq("stripe_object_id", refundObjectId)
        .maybeSingle()

      if (!existingRefund?.id) {
        console.log(`  + refund   ${bookingId.slice(0, 8)}  $${refunded.toFixed(2)}`)
        if (!dryRun) {
          await recordFinancialEvent(admin, {
            eventType: "refund",
            amountCents: -Math.round(refunded * 100),
            bookingId,
            userId: typeof row.guest_id === "string" ? row.guest_id : null,
            stripeObjectId: refundObjectId,
            source: "finance_backfill",
            occurredAt: bookingRefundedAt(row) ?? (typeof row.updated_at === "string" ? row.updated_at : undefined),
            metadata: { refunded_amount: refunded },
          })
        }
        refunds += 1
      } else {
        skipped += 1
      }
    }
  }

  console.log(`\nSummary: ${captures} captures, ${subsidies} subsidies, ${refunds} refunds, ${skipped} skipped (already in ledger)`)
  if (dryRun) console.log("Re-run without --dry-run to write.\n")
  else console.log("Done.\n")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
