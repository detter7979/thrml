import type { SupabaseClient } from "@supabase/supabase-js"

import {
  cashPlatformTakeCents,
  dollarsFromCents,
  grossPlatformTakeCents,
  promoCreditsAppliedCents,
} from "@/lib/finance/booking-economics"

type AdminClient = SupabaseClient

export type DailyFinanceSnapshot = {
  snapshot_date: string
  booking_count: number
  gross_booking_value: number
  gross_platform_take: number
  platform_revenue: number
  host_payouts: number
  refunds_issued: number
  credits_applied: number
  chargebacks: number
  net_platform_revenue: number
  avg_order_value: number
  new_users: number
  new_listings: number
}

const BOOKING_SELECT_TRIES = [
  "total_charged, host_payout, guest_fee, host_fee, service_fee, subtotal, referral_credit_applied_cents, user_credit_applied_cents, status",
  "total_charged, host_payout, service_fee, subtotal, referral_credit_applied_cents, user_credit_applied_cents, status",
  "total_charged, host_payout, service_fee, subtotal, status",
]

async function loadBookingsForDay(admin: AdminClient, dayStart: string, dayEnd: string) {
  for (const select of BOOKING_SELECT_TRIES) {
    const { data, error } = await admin
      .from("bookings")
      .select(select)
      .in("status", ["confirmed", "completed"])
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)

    if (!error) return data ?? []
  }
  return []
}

export async function buildDailyFinanceSnapshot(
  admin: AdminClient,
  date: string
): Promise<DailyFinanceSnapshot> {
  const dayStart = `${date}T00:00:00.000Z`
  const dayEnd = `${date}T23:59:59.999Z`

  const rows = await loadBookingsForDay(admin, dayStart, dayEnd)
  const bookingCount = rows.length
  const grossBookingValue = rows.reduce((s, r) => s + Number(r.total_charged ?? 0), 0)
  const hostPayouts = rows.reduce((s, r) => s + Number(r.host_payout ?? 0), 0)
  const grossPlatformTake = rows.reduce((s, r) => s + dollarsFromCents(grossPlatformTakeCents(r)), 0)
  const platformRevenue = rows.reduce((s, r) => s + dollarsFromCents(cashPlatformTakeCents(r)), 0)
  const creditsApplied = rows.reduce((s, r) => s + dollarsFromCents(promoCreditsAppliedCents(r)), 0)

  const [{ data: refundEvents }, { data: chargebackEvents }, usersResult, listingsResult] =
    await Promise.all([
      admin
        .from("financial_events")
        .select("amount_cents")
        .eq("event_type", "refund")
        .gte("occurred_at", dayStart)
        .lte("occurred_at", dayEnd),
      admin
        .from("financial_events")
        .select("amount_cents")
        .in("event_type", ["chargeback", "chargeback_fee"])
        .gte("occurred_at", dayStart)
        .lte("occurred_at", dayEnd),
      admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", dayStart).lte("created_at", dayEnd),
      admin.from("listings").select("id", { count: "exact", head: true }).gte("created_at", dayStart).lte("created_at", dayEnd),
    ])

  const refundsIssued = (refundEvents ?? []).reduce(
    (s, r) => s + Math.abs(Number(r.amount_cents ?? 0)) / 100,
    0
  )
  const chargebacks = (chargebackEvents ?? []).reduce(
    (s, r) => s + Math.abs(Number(r.amount_cents ?? 0)) / 100,
    0
  )

  const netPlatformRevenue = platformRevenue - refundsIssued - chargebacks
  const avgOrderValue = bookingCount > 0 ? grossBookingValue / bookingCount : 0

  return {
    snapshot_date: date,
    booking_count: bookingCount,
    gross_booking_value: grossBookingValue,
    gross_platform_take: grossPlatformTake,
    platform_revenue: platformRevenue,
    host_payouts: hostPayouts,
    refunds_issued: refundsIssued,
    credits_applied: creditsApplied,
    chargebacks,
    net_platform_revenue: netPlatformRevenue,
    avg_order_value: avgOrderValue,
    new_users: usersResult.count ?? 0,
    new_listings: listingsResult.count ?? 0,
  }
}

export async function upsertDailyFinanceSnapshot(admin: AdminClient, date: string) {
  const snapshot = await buildDailyFinanceSnapshot(admin, date)
  const { error } = await admin.from("finance_snapshots").upsert(snapshot, {
    onConflict: "snapshot_date",
  })
  if (error) throw error
  return snapshot
}

/** Collect YYYY-MM-DD dates that have booking or ledger activity. */
export async function listFinanceActivityDates(
  admin: AdminClient,
  opts?: { since?: string; until?: string }
): Promise<string[]> {
  const since = opts?.since
  const until = opts?.until ?? new Date().toISOString().slice(0, 10)

  const dates = new Set<string>()

  let bookingQuery = admin
    .from("bookings")
    .select("created_at, updated_at, refunded_at")
    .in("status", ["confirmed", "completed", "cancelled"])

  if (since) bookingQuery = bookingQuery.gte("created_at", `${since}T00:00:00.000Z`)

  const [{ data: bookings }, { data: events }] = await Promise.all([
    bookingQuery,
    admin
      .from("financial_events")
      .select("occurred_at")
      .gte("occurred_at", since ? `${since}T00:00:00.000Z` : "1970-01-01T00:00:00.000Z")
      .lte("occurred_at", `${until}T23:59:59.999Z`),
  ])

  for (const row of bookings ?? []) {
    for (const field of [row.created_at, row.updated_at, row.refunded_at]) {
      if (typeof field === "string") dates.add(field.slice(0, 10))
    }
  }

  for (const row of events ?? []) {
    if (typeof row.occurred_at === "string") dates.add(row.occurred_at.slice(0, 10))
  }

  return Array.from(dates)
    .filter((d) => d <= until && (!since || d >= since))
    .sort()
}
