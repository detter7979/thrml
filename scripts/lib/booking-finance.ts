/** Normalize booking refund field across legacy/new schemas. */
export function bookingRefundedDollars(row: Record<string, unknown>) {
  return Number(row.refunded_amount ?? row.refund_amount ?? 0)
}

export function bookingRefundedAt(row: Record<string, unknown>) {
  const value = row.refunded_at
  return typeof value === "string" ? value : null
}

export function bookingOccurredAt(row: Record<string, unknown>): string | undefined {
  if (typeof row.updated_at === "string") return row.updated_at
  if (typeof row.created_at === "string") return row.created_at
  return undefined
}

export function bookingStripeRefundId(row: Record<string, unknown>) {
  const value = row.stripe_refund_id
  return typeof value === "string" && value ? value : null
}

export function bookingPromoCreditsCents(row: Record<string, unknown>) {
  return (
    Math.max(0, Number(row.referral_credit_applied_cents ?? 0)) +
    Math.max(0, Number(row.user_credit_applied_cents ?? 0))
  )
}

/** Select string safe for older bookings tables. */
export const BOOKING_FINANCE_SELECT =
  "id, guest_id, status, stripe_payment_intent_id, stripe_refund_id, subtotal, total_charged, host_payout, service_fee, refund_amount, refunded_amount, refunded_at, referral_credit_applied_cents, user_credit_applied_cents, created_at, updated_at"

export async function loadBookingsForFinance(
  admin: { from: (table: string) => ReturnType<ReturnType<typeof import("@supabase/supabase-js").createClient>["from"]> },
  filters: { since?: string; statuses?: string[] }
) {
  const statuses = filters.statuses ?? ["confirmed", "completed", "cancelled"]
  const tries = [
    BOOKING_FINANCE_SELECT,
    "id, guest_id, status, stripe_payment_intent_id, stripe_refund_id, subtotal, total_charged, host_payout, service_fee, refund_amount, created_at, updated_at",
    "id, guest_id, status, stripe_payment_intent_id, subtotal, total_charged, host_payout, service_fee, refund_amount, created_at, updated_at",
  ]

  for (const select of tries) {
    let query = admin.from("bookings").select(select).in("status", statuses)
    if (filters.since) {
      query = query.gte("created_at", `${filters.since}T00:00:00.000Z`)
    }
    const { data, error } = await query
    if (!error) return (data ?? []) as Record<string, unknown>[]
  }

  throw new Error("Unable to load bookings for finance (missing expected columns)")
}
