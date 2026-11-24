import { formatSessionDateTime, sessionInstant } from "@/lib/session-time"

export type CancelledBy = "guest" | "host"
export type ListingCancellationPolicy = "Flexible" | "Moderate" | "Strict"

export type HostPenalty = {
  policyApplied: "warning" | "penalty_25" | "penalty_50_review"
  penaltyAmount: number
  requiresReview: boolean
  hoursBeforeSession: number
}

const HOUR_MS = 60 * 60 * 1000

export function normalizeCancellationPolicy(policy: unknown): ListingCancellationPolicy {
  const value = typeof policy === "string" ? policy.trim().toLowerCase() : ""
  if (value === "flexible") return "Flexible"
  if (value === "strict") return "Strict"
  return "Moderate"
}

/** The real start instant of a session (stored as Seattle wall-clock time). */
export function parseSessionStart(sessionDate: unknown, startTime: unknown): Date | null {
  return sessionInstant(sessionDate, startTime)
}

export function hoursUntilSession(sessionStart: Date, now = new Date()): number {
  return Math.max(0, (sessionStart.getTime() - now.getTime()) / HOUR_MS)
}

/** Hours before the session a guest must cancel for a full refund (minus the service fee). */
export const FULL_REFUND_WINDOW_HOURS: Record<ListingCancellationPolicy, number> = {
  Flexible: 24,
  Moderate: 48,
  Strict: 72,
}

/** Share of the refundable amount returned when a guest cancels inside the window. */
const LATE_REFUND_SHARE: Record<ListingCancellationPolicy, number> = {
  Flexible: 0.5,
  Moderate: 0.5,
  Strict: 0,
}

export type RefundDecision = {
  refundAmount: number
  policyApplied: string
  hoursUntilSession: number
}

/**
 * The one place refund amounts are decided. Matches the policy text shown on listings
 * (src/lib/constants/cancellation-policies.ts) and Terms §8.3:
 * - Guest, outside the window: full refund of the booking minus the non-refundable service fee.
 * - Guest, inside the window: 50% of that (Flexible, Moderate) or nothing (Strict).
 * - Host cancels: full refund including the service fee.
 *
 * `refundAnchor` is the earliest start time the guest has held for this booking. If a guest
 * reschedules a session that was inside the window to a later date, the window is still
 * measured from the original time, so rescheduling can't be used to get a bigger refund.
 */
export function computeRefund(params: {
  cancelledBy: CancelledBy
  policy: unknown
  sessionStart: Date | null
  refundAnchor?: Date | null
  totalCharged: number
  serviceFee: number
  now?: Date
}): RefundDecision {
  const now = params.now ?? new Date()
  const policy = normalizeCancellationPolicy(params.policy)
  const totalCharged = Math.max(0, Number(params.totalCharged) || 0)
  const serviceFee = Math.max(0, Number(params.serviceFee) || 0)
  const refundableBase = Math.max(0, totalCharged - serviceFee)

  // The anchor only limits guest refunds; a host cancellation is measured from the real start.
  const anchor = params.cancelledBy === "guest" ? params.refundAnchor : null
  const candidates = [params.sessionStart, anchor].filter(
    (value): value is Date => value instanceof Date && !Number.isNaN(value.getTime())
  )
  const measuredFrom = candidates.length
    ? new Date(Math.min(...candidates.map((value) => value.getTime())))
    : null
  const hours = measuredFrom ? hoursUntilSession(measuredFrom, now) : 0

  if (params.cancelledBy === "host") {
    return { refundAmount: roundCents(totalCharged), policyApplied: "host_full_refund", hoursUntilSession: hours }
  }

  const key = policy.toLowerCase()
  if (params.sessionStart && params.sessionStart.getTime() <= now.getTime()) {
    return { refundAmount: 0, policyApplied: `${key}_no_show`, hoursUntilSession: 0 }
  }
  if (hours >= FULL_REFUND_WINDOW_HOURS[policy]) {
    return { refundAmount: roundCents(refundableBase), policyApplied: `${key}_full_refund`, hoursUntilSession: hours }
  }
  const share = LATE_REFUND_SHARE[policy]
  if (share <= 0) {
    return { refundAmount: 0, policyApplied: `${key}_no_refund`, hoursUntilSession: hours }
  }
  return {
    refundAmount: roundCents(refundableBase * share),
    policyApplied: `${key}_partial_refund`,
    hoursUntilSession: hours,
  }
}

function roundCents(amount: number) {
  return Math.floor(amount * 100 + 1e-6) / 100
}

/** Plain-language timeline for the cancel screen, derived from the same numbers as computeRefund. */
export function getPolicyTimeline(policy: ListingCancellationPolicy) {
  const windowHours = FULL_REFUND_WINDOW_HOURS[policy]
  const lateShare = LATE_REFUND_SHARE[policy]
  const lateLabel = lateShare > 0 ? `${Math.round(lateShare * 100)}% refund` : "No refund"
  return {
    fullRefundCutoffHours: windowHours,
    beforeCutoff: "Full refund (service fee not included)",
    afterCutoff: `${lateLabel}${lateShare > 0 ? " (service fee not included)" : ""}`,
    reminder: `Cancel at least ${windowHours} hours before your session for a full refund, minus the service fee.`,
  }
}

export function calculateHostPenalty(hoursBeforeSession: number, isFirstOffence: boolean): HostPenalty {
  if (hoursBeforeSession > 72) {
    return {
      policyApplied: isFirstOffence ? "warning" : "warning",
      penaltyAmount: 0,
      requiresReview: false,
      hoursBeforeSession,
    }
  }

  if (hoursBeforeSession >= 24) {
    return {
      policyApplied: "penalty_25",
      penaltyAmount: 25,
      requiresReview: false,
      hoursBeforeSession,
    }
  }

  return {
    policyApplied: "penalty_50_review",
    penaltyAmount: 50,
    requiresReview: true,
    hoursBeforeSession,
  }
}

export function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function serializePolicyReminder(policy: ListingCancellationPolicy, sessionStart: Date | null) {
  const timeline = getPolicyTimeline(policy)
  const dateLabel = sessionStart
    ? formatSessionDateTime(sessionStart, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "your scheduled time"
  return `Cancel ${timeline.fullRefundCutoffHours} hours before your session (${dateLabel}) for a full refund, minus the service fee.`
}
