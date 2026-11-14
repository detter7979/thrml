/** Next test id in the namer's T-series: "T01" → "T02", "T9" → "T10". Unknown shapes get "-next". */
export function nextTestId(testId: string | null | undefined): string {
  const raw = (testId ?? "").trim()
  const m = /^T(\d+)$/i.exec(raw)
  if (!m) return raw ? `${raw}-next` : "T01"
  const n = Number(m[1]) + 1
  return `T${String(n).padStart(Math.max(2, m[1].length), "0")}`
}
