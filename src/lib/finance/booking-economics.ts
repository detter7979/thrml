import type { BookingEconomicsRow } from "@/lib/finance/types"

function num(value: number | string | null | undefined) {
  return Number(value ?? 0)
}

/** Cash platform take after credits: what guest paid minus host transfer. */
export function cashPlatformTakeCents(row: BookingEconomicsRow) {
  const guestPaidCents = Math.round(num(row.total_charged) * 100)
  const hostPayoutCents = Math.round(num(row.host_payout) * 100)
  return Math.max(0, guestPaidCents - hostPayoutCents)
}

/** Fee-based platform take before credits (guest + host fees). */
export function grossPlatformTakeCents(row: BookingEconomicsRow) {
  const guestFee = num(row.guest_fee) || num(row.service_fee)
  let hostFee = num(row.host_fee)
  if (hostFee <= 0 && num(row.subtotal) > 0 && num(row.host_payout) > 0) {
    hostFee = Math.max(0, num(row.subtotal) - num(row.host_payout))
  }
  if (guestFee > 0 || hostFee > 0) {
    return Math.round((guestFee + hostFee) * 100)
  }
  return cashPlatformTakeCents(row)
}

export function promoCreditsAppliedCents(row: BookingEconomicsRow) {
  return Math.max(0, Math.round(num(row.referral_credit_applied_cents)))
    + Math.max(0, Math.round(num(row.user_credit_applied_cents)))
}

export function dollarsFromCents(cents: number) {
  return Math.round(cents) / 100
}
