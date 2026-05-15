export function toMinutes(value: string): number | null {
  const [hours, minutes] = value.split(":").map((part) => Number(part))
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

export function fromMinutes(total: number): string {
  const normalized = Math.max(0, Math.min(total, 24 * 60 - 1))
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

export function normalizeDayIndex(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0 && value <= 6) return value
    if (value >= 1 && value <= 7) return value % 7
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    const aliases: Record<string, number> = {
      sun: 0,
      sunday: 0,
      mon: 1,
      monday: 1,
      tue: 2,
      tues: 2,
      tuesday: 2,
      wed: 3,
      wednesday: 3,
      thu: 4,
      thur: 4,
      thurs: 4,
      thursday: 4,
      fri: 5,
      friday: 5,
      sat: 6,
      saturday: 6,
    }
    if (normalized in aliases) return aliases[normalized]
    const asNumber = Number(normalized)
    if (Number.isFinite(asNumber)) return normalizeDayIndex(asNumber)
  }
  return null
}

export type AvailabilityWindow = { startMinutes: number; endMinutes: number }

export function availabilityWindowsForDay(availability: unknown[], date: Date): AvailabilityWindow[] {
  const jsDay = date.getDay()
  const rawRows = availability.filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object"
  )

  return rawRows
    .filter((item) => {
      const dayIndex =
        normalizeDayIndex(item.day) ??
        normalizeDayIndex(item.day_of_week) ??
        normalizeDayIndex(item.dayIndex)
      const dayMatches = dayIndex === jsDay
      const enabled =
        typeof item.enabled === "boolean"
          ? item.enabled
          : typeof item.is_available === "boolean"
            ? item.is_available
            : typeof item.isAvailable === "boolean"
              ? item.isAvailable
              : true
      return dayMatches && enabled
    })
    .map((window) => {
      const startMinutes = toMinutes(
        typeof window.start === "string"
          ? window.start
          : typeof window.start_time === "string"
            ? window.start_time
            : "10:00"
      )
      const endMinutes = toMinutes(
        typeof window.end === "string"
          ? window.end
          : typeof window.end_time === "string"
            ? window.end_time
            : "18:00"
      )
      if (startMinutes === null || endMinutes === null) return null
      return { startMinutes, endMinutes }
    })
    .filter((w): w is AvailabilityWindow => w !== null && w.endMinutes > w.startMinutes)
}

export function withinAvailability(
  availability: unknown[],
  sessionDate: string,
  startTime: string,
  endTime: string
): boolean {
  if (!Array.isArray(availability) || availability.length === 0) return true
  const date = new Date(`${sessionDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return false

  const sessionStart = toMinutes(startTime)
  const sessionEnd = toMinutes(endTime)
  if (sessionStart === null || sessionEnd === null || sessionEnd <= sessionStart) return false

  const windows = availabilityWindowsForDay(availability, date)
  if (!windows.length) return false

  return windows.some((window) => sessionStart >= window.startMinutes && sessionEnd <= window.endMinutes)
}

export function parseIsoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

export function durationBetweenTimes(startTime: string, endTime: string): number | null {
  const start = toMinutes(startTime)
  const end = toMinutes(endTime)
  if (start === null || end === null || end <= start) return null
  return end - start
}
