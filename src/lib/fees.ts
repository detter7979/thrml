import type { SupabaseClient } from "@supabase/supabase-js"

export const PLATFORM_FEE_SETTING_KEYS = ["guest_fee_percent", "host_fee_percent"] as const

export type PlatformFeeSettingKey = (typeof PLATFORM_FEE_SETTING_KEYS)[number]

export type PlatformFeePercents = {
  guestFeePercent: number
  hostFeePercent: number
}

export type FeeBreakdown = {
  subtotal: number
  guestFee: number
  hostFee: number
  guestTotal: number
  hostPayout: number
}

export type ProtectedBookingCreditInput = {
  guestTotalCents: number
  hostPayoutCents: number
  availableCreditCents: number
  stripeMinChargeCents?: number
}

type AdminLike = Pick<SupabaseClient, "from">

let feePercentsCache: { value: PlatformFeePercents; expiresAt: number } | null = null
const FEE_CACHE_MS = 60_000
export const STRIPE_MIN_CHARGE_CENTS = 50

export function invalidatePlatformFeePercentsCache() {
  feePercentsCache = null
}

export function parsePercentFromSetting(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/**
 * Pure fee math. Amounts are in dollars; uses cent rounding for Stripe alignment.
 */
export function calculateFees(
  subtotal: number,
  guestFeePercent: number,
  hostFeePercent: number
): FeeBreakdown {
  const subCents = Math.round(Math.max(0, subtotal) * 100)
  const guestPct = Math.max(0, guestFeePercent)
  const hostPct = Math.max(0, hostFeePercent)
  const guestFeeCents = Math.round(subCents * (guestPct / 100))
  const hostFeeCents = Math.round(subCents * (hostPct / 100))
  const guestTotalCents = subCents + guestFeeCents
  const hostPayoutCents = subCents - hostFeeCents

  return {
    subtotal: subCents / 100,
    guestFee: guestFeeCents / 100,
    hostFee: hostFeeCents / 100,
    guestTotal: guestTotalCents / 100,
    hostPayout: hostPayoutCents / 100,
  }
}

export function calculateProtectedBookingCreditCents({
  guestTotalCents,
  hostPayoutCents,
  availableCreditCents,
  stripeMinChargeCents = STRIPE_MIN_CHARGE_CENTS,
}: ProtectedBookingCreditInput): number {
  const dueCents = Math.max(0, Math.round(guestTotalCents))
  const payoutCents = Math.max(0, Math.round(hostPayoutCents))
  const creditCents = Math.max(0, Math.round(availableCreditCents))
  const minChargeCents = Math.max(0, Math.round(stripeMinChargeCents))
  const platformTakeCents = Math.max(0, dueCents - payoutCents)
  const maxForStripe =
    dueCents >= minChargeCents ? Math.max(0, dueCents - minChargeCents) : 0

  return Math.min(creditCents, platformTakeCents, maxForStripe)
}

export async function fetchPlatformFeePercents(admin: AdminLike): Promise<PlatformFeePercents> {
  const { data, error } = await admin
    .from("platform_settings")
    .select("key, value")
    .in("key", [...PLATFORM_FEE_SETTING_KEYS])

  if (error) {
    throw new Error(error.message)
  }

  const byKey = new Map<string, unknown>()
  for (const row of data ?? []) {
    if (typeof row.key === "string") byKey.set(row.key, row.value)
  }

  const guest = parsePercentFromSetting(byKey.get("guest_fee_percent"))
  const host = parsePercentFromSetting(byKey.get("host_fee_percent"))

  if (guest === null || host === null) {
    throw new Error("Missing guest_fee_percent or host_fee_percent in platform_settings")
  }

  return { guestFeePercent: guest, hostFeePercent: host }
}

export async function getPlatformFeePercentsCached(admin: AdminLike): Promise<PlatformFeePercents> {
  const now = Date.now()
  if (feePercentsCache && now < feePercentsCache.expiresAt) {
    return feePercentsCache.value
  }
  const value = await fetchPlatformFeePercents(admin)
  feePercentsCache = { value, expiresAt: now + FEE_CACHE_MS }
  return value
}
