/**
 * Session dates and times are stored as local wall-clock values for the listing's market
 * (e.g. session_date "2026-12-04", start_time "10:00:00" means 10 AM in Seattle).
 *
 * `new Date("2026-12-04T10:00:00")` reads that in the *runtime's* time zone. On Vercel that is
 * UTC, which puts every session 8 hours early (7 in summer). Use these helpers for any
 * server-side comparison against "now" (refund windows, reminders, auto-complete).
 *
 * All launch listings are in the Seattle area. If listings ever span time zones, store a
 * time zone on the listing and pass it as `timeZone`.
 */
export const MARKET_TIME_ZONE = "America/Los_Angeles"

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/

function wallClockParts(instantMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs))
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  }
}

/** Offset (ms) between the zone's wall clock and UTC at a given instant. */
function zoneOffsetMs(instantMs: number, timeZone: string) {
  const p = wallClockParts(instantMs, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(instantMs / 1000) * 1000
}

/**
 * The real instant a session starts (or ends), from a stored date and wall-clock time.
 * Returns null for missing or malformed input.
 */
export function sessionInstant(
  sessionDate: unknown,
  time: unknown,
  timeZone: string = MARKET_TIME_ZONE
): Date | null {
  if (typeof sessionDate !== "string") return null
  const dateMatch = DATE_RE.exec(sessionDate.trim())
  if (!dateMatch) return null
  const timeValue = typeof time === "string" && time.trim() ? time.trim() : "00:00"
  const timeMatch = TIME_RE.exec(timeValue)
  if (!timeMatch) return null

  const [year, month, day] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])]
  const [hour, minute, second] = [Number(timeMatch[1]), Number(timeMatch[2]), Number(timeMatch[3] ?? 0)]
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  if (Number.isNaN(wallAsUtc)) return null

  // Two passes handle the hour around DST changes.
  let instant = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone)
  const secondOffset = zoneOffsetMs(instant, timeZone)
  instant = wallAsUtc - secondOffset
  return new Date(instant)
}

/** Today's date (YYYY-MM-DD) in the market time zone. */
export function marketDateString(now: Date = new Date(), timeZone: string = MARKET_TIME_ZONE) {
  const p = wallClockParts(now.getTime(), timeZone)
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
}

/** Format a session instant for people in the market (emails, server-rendered text). */
export function formatSessionDateTime(
  instant: Date,
  options: Intl.DateTimeFormatOptions,
  timeZone: string = MARKET_TIME_ZONE
) {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(instant)
}

/**
 * Scheduled jobs run once a day (Vercel Hobby). Something meant to go out `hoursBefore` a
 * session is sent by the last run before that moment, so it is never late, at the cost of
 * arriving up to a day early ("the day before" / "the morning of").
 *
 * Returns true when the send moment falls before the next run and the session hasn't started.
 */
export function isDueBeforeNextRun(params: {
  startsAt: Date
  hoursBefore: number
  now?: Date
  /** When the next scheduled run happens. Defaults to 24 hours from `now`. */
  nextRunAt?: Date
}) {
  const now = params.now ?? new Date()
  const nextRunMs = params.nextRunAt?.getTime() ?? now.getTime() + 24 * 60 * 60 * 1000
  if (params.startsAt.getTime() <= now.getTime()) return false
  const sendAt = params.startsAt.getTime() - params.hoursBefore * 60 * 60 * 1000
  return sendAt < nextRunMs
}

/** UTC hour the daily reminders job runs (vercel.json: "0 8 * * *", midnight Pacific in winter). */
export const REMINDERS_RUN_UTC_HOUR = 8

/** The next daily reminders run after `now`. */
export function nextRemindersRunAt(now: Date = new Date()) {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), REMINDERS_RUN_UTC_HOUR, 0, 0)
  )
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1)
  return next
}
