import type { SupabaseClient } from "@supabase/supabase-js"

const BOOKING_EARNINGS_SELECT_TRIES = [
  "id, listing_id, guest_id, host_id, session_date, start_time, end_time, duration_hours, guest_count, price_per_person, subtotal, service_fee, host_payout, total_charged, guest_fee, host_fee, refunded_amount, referral_credit_applied_cents, user_credit_applied_cents, status, created_at",
  "id, listing_id, guest_id, host_id, session_date, start_time, end_time, duration_hours, guest_count, price_per_person, subtotal, service_fee, host_payout, total_charged, guest_fee, host_fee, refunded_amount, user_credit_applied_cents, status, created_at",
  "id, listing_id, guest_id, host_id, session_date, start_time, end_time, duration_hours, guest_count, price_per_person, subtotal, service_fee, host_payout, total_charged, refunded_amount, status, created_at",
] as const

export async function loadAdminEarningsBookings(admin: SupabaseClient) {
  let lastError: string | null = null

  for (const select of BOOKING_EARNINGS_SELECT_TRIES) {
    const { data, error } = await admin.from("bookings").select(select).order("session_date", { ascending: false })
    if (!error) {
      return { rows: (data ?? []) as Record<string, unknown>[], loadError: null as string | null }
    }
    lastError = error.message
  }

  return { rows: [] as Record<string, unknown>[], loadError: lastError }
}
