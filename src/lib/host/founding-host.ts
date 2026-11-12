import type { SupabaseClient } from "@supabase/supabase-js"

import { parsePercentFromSetting } from "@/lib/fees"

export type FoundingHostSettings = {
  feePercent: number
  cap: number
  windowDays: number
}

export const DEFAULT_FOUNDING_HOST_SETTINGS: FoundingHostSettings = {
  feePercent: 10,
  cap: 25,
  windowDays: 90,
}

export type FoundingHostProfile = {
  founding_host?: boolean | null
  founding_fee_expires_at?: string | null
}

export type ResolvedHostFee = {
  hostFeePercent: number
  /** True when the founding rate applies to this booking. */
  foundingRateApplied: boolean
  /** Window hasn't started yet — it will start when this booking is paid. */
  windowNotStarted: boolean
}

/**
 * The host fee for a booking. Founding hosts get the reduced rate until their window
 * (which starts at their first paid booking) expires; never higher than the global fee.
 */
export function resolveHostFeePercent(input: {
  globalHostFeePercent: number
  profile: FoundingHostProfile | null | undefined
  foundingFeePercent: number
  now?: Date
}): ResolvedHostFee {
  const now = input.now ?? new Date()
  const isFounding = input.profile?.founding_host === true
  if (!isFounding) {
    return { hostFeePercent: input.globalHostFeePercent, foundingRateApplied: false, windowNotStarted: false }
  }

  const expiresAt = input.profile?.founding_fee_expires_at ? new Date(input.profile.founding_fee_expires_at) : null
  const windowNotStarted = expiresAt === null || Number.isNaN(expiresAt.getTime())
  const active = windowNotStarted || (expiresAt !== null && now.getTime() < expiresAt.getTime())

  if (!active) {
    return { hostFeePercent: input.globalHostFeePercent, foundingRateApplied: false, windowNotStarted: false }
  }

  return {
    hostFeePercent: Math.min(input.foundingFeePercent, input.globalHostFeePercent),
    foundingRateApplied: true,
    windowNotStarted,
  }
}

/** Human status for dashboards/emails. */
export function foundingFeeStatus(input: {
  profile: FoundingHostProfile | null | undefined
  settings: FoundingHostSettings
  now?: Date
}): { kind: "none" } | { kind: "pending" } | { kind: "active"; expiresAt: Date; daysLeft: number } | { kind: "ended" } {
  if (input.profile?.founding_host !== true) return { kind: "none" }
  const raw = input.profile.founding_fee_expires_at
  if (!raw) return { kind: "pending" }
  const expiresAt = new Date(raw)
  const now = input.now ?? new Date()
  const msLeft = expiresAt.getTime() - now.getTime()
  if (msLeft <= 0) return { kind: "ended" }
  return { kind: "active", expiresAt, daysLeft: Math.ceil(msLeft / 86_400_000) }
}

type AdminLike = Pick<SupabaseClient, "from">

export async function fetchFoundingHostSettings(admin: AdminLike): Promise<FoundingHostSettings> {
  const { data } = await admin
    .from("platform_settings")
    .select("key, value")
    .in("key", ["founding_host_fee_percent", "founding_host_cap", "founding_fee_window_days"])

  const byKey = new Map<string, unknown>((data ?? []).map((row) => [String(row.key), row.value]))
  const fee = parsePercentFromSetting(byKey.get("founding_host_fee_percent"))
  const cap = parsePercentFromSetting(byKey.get("founding_host_cap"))
  const days = parsePercentFromSetting(byKey.get("founding_fee_window_days"))

  return {
    feePercent: fee ?? DEFAULT_FOUNDING_HOST_SETTINGS.feePercent,
    cap: cap ?? DEFAULT_FOUNDING_HOST_SETTINGS.cap,
    windowDays: days ?? DEFAULT_FOUNDING_HOST_SETTINGS.windowDays,
  }
}

/** Spots left in the founding program (for landing page copy). */
export async function foundingSpotsRemaining(admin: AdminLike, cap: number): Promise<number> {
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("founding_host", true)
  return Math.max(0, cap - (count ?? 0))
}
