export type FinancePeriod = "7d" | "mtd" | "30d" | "90d" | "ytd"

export function yesterdayIso() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function resolveFinancePeriodRange(period: FinancePeriod, endDate = yesterdayIso()) {
  const end = endDate
  const endMs = Date.parse(`${end}T12:00:00Z`)

  if (period === "7d") {
    const startMs = endMs - 6 * 24 * 60 * 60 * 1000
    return { period, start: new Date(startMs).toISOString().slice(0, 10), end }
  }

  if (period === "30d") {
    const startMs = endMs - 29 * 24 * 60 * 60 * 1000
    return { period, start: new Date(startMs).toISOString().slice(0, 10), end }
  }

  if (period === "90d") {
    const startMs = endMs - 89 * 24 * 60 * 60 * 1000
    return { period, start: new Date(startMs).toISOString().slice(0, 10), end }
  }

  const endYear = new Date(endMs).getUTCFullYear()
  const endMonth = new Date(endMs).getUTCMonth()

  if (period === "ytd") {
    return { period, start: `${endYear}-01-01`, end }
  }

  // mtd
  const month = String(endMonth + 1).padStart(2, "0")
  return { period: "mtd" as const, start: `${endYear}-${month}-01`, end }
}

export function daysInclusive(start: string, end: string) {
  const a = Date.parse(`${start}T12:00:00Z`)
  const b = Date.parse(`${end}T12:00:00Z`)
  return Math.max(1, Math.round((b - a) / (24 * 60 * 60 * 1000)) + 1)
}

export function daysInMonth(dateIso: string) {
  const [y, m] = dateIso.split("-").map(Number)
  return new Date(y, m, 0).getDate()
}

export function parseSheetDate(value: unknown): string | null {
  if (value == null || value === "") return null
  if (typeof value === "number" && !Number.isNaN(value)) {
    const d = new Date(Date.UTC(1899, 11, 30) + value * 86400000)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  const s = String(value).trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

export function dateInRange(date: string, start: string, end: string) {
  return date >= start && date <= end
}
