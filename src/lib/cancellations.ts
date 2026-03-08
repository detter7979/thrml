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

export function parseSessionStart(sessionDate: unknown, startTime: unknown): Date | null {
  if (typeof sessionDate !== "string" || !sessionDate) return null
  const time = typeof startTime === "string" && startTime ? startTime : "00:00"
  const parsed = new Date(`${sessionDate}T${time}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function hoursUntilSession(sessionStart: Date, now = new Date()): number {
  return Math.max(0, (sessionStart.getTime() - now.getTime()) / HOUR_MS)
}

export function getPolicyTimeline(policy: ListingCancellationPolicy) {
  if (policy === "Flexible") {
    return {
      over72h: "50% refund",
      between24And72h: "50% refund",
      under24h: "No refund",
      fullRefundCutoffHours: 9999,
      reminder: "Cancel at least 72 hours before your session for a 50% refund.",
    }
  }
  if (policy === "Strict") {
    return {
      over72h: "Full refund",
      between24And72h: "No refund",
      under24h: "No refund",
      fullRefundCutoffHours: 72,
      reminder: "Cancel at least 72 hours before your session for a full refund.",
    }
  }
  return {
    over72h: "Full refund",
    between24And72h: "No refund",
    under24h: "No refund",
    fullRefundCutoffHours: 72,
    reminder: "Cancel at least 72 hours before your session for a full refund.",
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
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(sessionStart)
    : "your scheduled time"
  const hourLabel =
    timeline.fullRefundCutoffHours === 9999
      ? "72"
      : String(timeline.fullRefundCutoffHours)
  return `Cancel ${hourLabel} hours before your session (${dateLabel}) for a full refund.`
}
