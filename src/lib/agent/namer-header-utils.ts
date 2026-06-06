/**
 * Shared header-row detection for thrml_namer_v4 builder tabs.
 */

export function findCampaignBuilderHeader(
  rows: string[][]
): { headerRow: number; headers: string[] } | null {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const line = (rows[r] ?? []).map((c) => String(c).trim())
    const joined = line.join(" ").toLowerCase()
    if (
      (joined.includes("camp id") || joined.includes("campaign id")) &&
      (joined.includes("platform") || joined.includes("persona"))
    ) {
      return { headerRow: r, headers: line }
    }
    if (joined.includes("platform") && joined.includes("camp")) {
      return { headerRow: r, headers: line }
    }
  }
  return null
}

export function findAdSetBuilderHeader(
  rows: string[][]
): { headerRow: number; headers: string[] } | null {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const line = (rows[r] ?? []).map((c) => String(c).trim())
    const joined = line.join(" ").toLowerCase()
    if (
      (joined.includes("adset id") || joined.includes("ad set id")) &&
      (joined.includes("camp id") || joined.includes("campaign id") || joined.includes("audience"))
    ) {
      return { headerRow: r, headers: line }
    }
  }
  return null
}

export function colIndex(headers: string[], patterns: readonly RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] ?? "").trim()
    if (patterns.some((p) => p.test(h))) return i
  }
  return -1
}

export function cellValue(row: string[], headers: string[], patterns: readonly RegExp[]): string {
  const idx = colIndex(headers, patterns)
  if (idx < 0) return ""
  return (row[idx] ?? "").trim()
}
