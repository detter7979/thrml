import { isDueBeforeNextRun } from "@/lib/session-time"

/**
 * When a listing's access details go out. Keys are stored on listings.access_code_send_timing.
 * Scheduled sends happen in the daily run, so "24h_before" goes out the day before and
 * "1h_before" goes out early on the day of the session (see isDueBeforeNextRun).
 */
const SEND_HOURS_BEFORE: Record<string, number | null> = {
  on_confirm: null,
  "24h_before": 24,
  "1h_before": 1,
}

/** Access types that aren't codes (host on site, other) send their details on the day. */
const DEFAULT_HOURS_BEFORE = 1

export function accessSendHoursBefore(timing: string | null | undefined): number | null {
  if (typeof timing === "string" && timing in SEND_HOURS_BEFORE) return SEND_HOURS_BEFORE[timing]
  return DEFAULT_HOURS_BEFORE
}

/** True when a booking's access details should be sent now rather than in a later run. */
export function isAccessDetailsDue(params: {
  timing: string | null | undefined
  startsAt: Date | null
  now?: Date
  nextRunAt?: Date
}) {
  if (!params.startsAt) return false
  const now = params.now ?? new Date()
  if (params.startsAt.getTime() <= now.getTime()) return false
  const hoursBefore = accessSendHoursBefore(params.timing)
  if (hoursBefore === null) return true
  return isDueBeforeNextRun({ startsAt: params.startsAt, hoursBefore, now, nextRunAt: params.nextRunAt })
}
