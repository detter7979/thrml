import { NextResponse } from "next/server"

import {
  cashPlatformTakeCents,
  dollarsFromCents,
  grossPlatformTakeCents,
  promoCreditsAppliedCents,
} from "@/lib/finance/booking-economics"
import { requireAdminApi } from "@/lib/admin-guard"

export const dynamic = "force-dynamic"

export async function GET() {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: eventCount },
    { count: disputeCount },
    { data: recentEvents },
    { data: snapshots },
    { data: paidBookings },
    { data: referralRows },
    { data: userCreditRows },
  ] = await Promise.all([
    admin.from("financial_events").select("id", { count: "exact", head: true }),
    admin.from("stripe_disputes").select("id", { count: "exact", head: true }),
    admin
      .from("financial_events")
      .select("id, event_type, amount_cents, source, occurred_at, booking_id")
      .order("occurred_at", { ascending: false })
      .limit(15),
    admin
      .from("finance_snapshots")
      .select("*")
      .order("snapshot_date", { ascending: false })
      .limit(7),
    admin
      .from("bookings")
      .select(
        "id, status, subtotal, total_charged, host_payout, service_fee, referral_credit_applied_cents, user_credit_applied_cents, refunded_amount, stripe_payment_intent_id"
      )
      .in("status", ["confirmed", "completed"])
      .gte("created_at", since),
    admin.from("profiles").select("referral_credit_cents"),
    admin.from("user_credits").select("balance"),
  ])

  const bookings = paidBookings ?? []
  const missingCapture = bookings.filter((b) => {
    if (!b.stripe_payment_intent_id) return false
    return true
  })

  const { data: captureEvents } = await admin
    .from("financial_events")
    .select("booking_id")
    .eq("event_type", "booking_capture")
    .in(
      "booking_id",
      bookings.map((b) => b.id).filter(Boolean)
    )

  const capturedIds = new Set((captureEvents ?? []).map((e) => e.booking_id))
  const gaps = missingCapture.filter((b) => !capturedIds.has(b.id))

  const mtd = {
    bookings: bookings.length,
    gmv: bookings.reduce((s, b) => s + Number(b.total_charged ?? 0), 0),
    grossTake: bookings.reduce((s, b) => s + dollarsFromCents(grossPlatformTakeCents(b)), 0),
    cashTake: bookings.reduce((s, b) => s + dollarsFromCents(cashPlatformTakeCents(b)), 0),
    promoCredits: bookings.reduce((s, b) => s + dollarsFromCents(promoCreditsAppliedCents(b)), 0),
    refunds: bookings.reduce((s, b) => s + Number(b.refunded_amount ?? 0), 0),
  }

  const referralLiabilityCents = (referralRows ?? []).reduce(
    (s, r) => s + Math.max(0, Number(r.referral_credit_cents ?? 0)),
    0
  )
  const adminCreditLiabilityCents = (userCreditRows ?? []).reduce(
    (s, r) => s + Math.max(0, Number(r.balance ?? 0)),
    0
  )

  return NextResponse.json({
    ok: true,
    ledger: {
      totalEvents: eventCount ?? 0,
      openDisputes: disputeCount ?? 0,
      recentEvents: recentEvents ?? [],
    },
    snapshots: snapshots ?? [],
    last30Days: mtd,
    liability: {
      referralCreditsUsd: referralLiabilityCents / 100,
      adminCreditsUsd: adminCreditLiabilityCents / 100,
    },
    gaps: {
      missingCaptureCount: gaps.length,
      bookingIds: gaps.slice(0, 20).map((b) => b.id),
    },
    nextSteps:
      gaps.length > 0
        ? ["Run: npx tsx scripts/finance-backfill.ts"]
        : ["Ledger looks aligned for last 30d paid bookings"],
  })
}
