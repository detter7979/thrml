export const FINANCIAL_EVENT_TYPES = [
  "booking_capture",
  "refund",
  "credit_subsidy",
  "referral_credit_restore",
  "user_credit_restore",
  "chargeback",
  "chargeback_fee",
  "chargeback_reversal",
  "stripe_fee",
] as const

export type FinancialEventType = (typeof FINANCIAL_EVENT_TYPES)[number]

export type BookingEconomicsRow = {
  subtotal?: number | string | null
  total_charged?: number | string | null
  host_payout?: number | string | null
  guest_fee?: number | string | null
  host_fee?: number | string | null
  service_fee?: number | string | null
  referral_credit_applied_cents?: number | string | null
  user_credit_applied_cents?: number | string | null
}
