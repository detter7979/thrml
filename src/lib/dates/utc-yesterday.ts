/** Yesterday calendar date in UTC (YYYY-MM-DD). */
export function utcYesterdayRange(): { dateStart: string; dateEnd: string } {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  const s = d.toISOString().slice(0, 10)
  return { dateStart: s, dateEnd: s }
}

/** Inclusive UTC calendar dates from dateStart through dateEnd (YYYY-MM-DD). */
export function utcDatesInclusive(dateStart: string, dateEnd: string): string[] {
  const out: string[] = []
  const cur = new Date(`${dateStart}T00:00:00.000Z`)
  const end = new Date(`${dateEnd}T00:00:00.000Z`)
  if (cur.getTime() > end.getTime()) return []
  while (cur.getTime() <= end.getTime()) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}
