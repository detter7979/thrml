import {
  batchWriteCells,
  columnToLetter,
  createGoogleSheetsClient,
  listSpreadsheetTabs,
  readSheetValues,
  replaceTabValues,
  resolveTabTitle,
} from "@/lib/agent/google-sheets-client"
import { findCreativeBuilderHeader } from "@/lib/agent/namer-creative-append"
import {
  HEADER_PATTERNS,
  NAMER_TAB_CANDIDATES,
  type NamerTabKind,
} from "@/lib/agent/namer-sheet-schema"
import { resolveNamerSheetId } from "@/lib/agent/namer-creative-append"
import type { SupabaseClient } from "@supabase/supabase-js"

export type NamerCleanupResult = {
  ok: boolean
  tab: string
  rowsBefore: number
  rowsAfter: number
  duplicatesRemoved: number
  removedPreview: string[][]
}

function colIndex(headers: string[], patterns: readonly RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i] ?? ""
    if (patterns.some((p) => p.test(h))) return i
  }
  return -1
}

function cell(row: string[], col: number): string {
  if (col < 0) return ""
  return (row[col] ?? "").trim()
}

function rowKey(parts: string[]): string {
  return parts.map((p) => p.trim().toLowerCase()).filter(Boolean).join("|")
}

function scoreDataRow(row: string[]): number {
  let score = 0
  for (const value of row) {
    const v = (value ?? "").trim()
    if (v) score += 1
  }
  return score
}

function findHeaderRowCampaignAdSet(rows: string[][]): { headerRow: number; headers: string[] } | null {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const line = rows[r] ?? []
    const joined = line.join(" ").toLowerCase()
    if (joined.includes("campaign id") && (joined.includes("platform") || joined.includes("status"))) {
      return { headerRow: r, headers: line.map((c) => String(c).trim()) }
    }
    if (joined.includes("ad set id") && joined.includes("campaign id")) {
      return { headerRow: r, headers: line.map((c) => String(c).trim()) }
    }
  }
  return null
}

type DedupeConfig = {
  keyCols: readonly (readonly RegExp[])[]
  /** When true, blank-key rows are kept (manual drafts). */
  keepBlankKeys?: boolean
}

function dedupeRows(
  rows: string[][],
  headerRow: number,
  headers: string[],
  config: DedupeConfig
): { kept: string[][]; removed: string[][]; duplicatesRemoved: number } {
  const preamble = rows.slice(0, headerRow + 1)
  const data = rows.slice(headerRow + 1)
  const keyCols = config.keyCols.map((patterns) => colIndex(headers, patterns))

  const bestByKey = new Map<string, { row: string[]; score: number; index: number }>()
  const blankRows: string[][] = []

  for (let i = 0; i < data.length; i++) {
    const row = data[i] ?? []
    const keyParts = keyCols.map((col) => cell(row, col))
    const hasKey = keyParts.some(Boolean)
    if (!hasKey) {
      if (config.keepBlankKeys) blankRows.push(row)
      continue
    }
    const key = rowKey(keyParts)
    const score = scoreDataRow(row)
    const prev = bestByKey.get(key)
    if (!prev || score > prev.score || (score === prev.score && i > prev.index)) {
      bestByKey.set(key, { row, score, index: i })
    }
  }

  const keptData = [...bestByKey.values()]
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.row)
  const keptKeys = new Set(bestByKey.keys())
  const removed: string[][] = []

  for (let i = 0; i < data.length; i++) {
    const row = data[i] ?? []
    const keyParts = keyCols.map((col) => cell(row, col))
    const hasKey = keyParts.some(Boolean)
    if (!hasKey) continue
    const key = rowKey(keyParts)
    const winner = bestByKey.get(key)
    if (!winner) continue
    if (winner.index !== i) removed.push(row)
    else if (!keptKeys.has(key)) removed.push(row)
  }

  return {
    kept: [...preamble, ...keptData, ...blankRows],
    removed,
    duplicatesRemoved: removed.length,
  }
}

async function loadTab(sheetId: string, tabTitle: string) {
  const sheets = createGoogleSheetsClient()
  const rows = await readSheetValues(sheets, sheetId, tabTitle)
  return { sheets, rows }
}

export async function dedupeNamerTab(
  admin: SupabaseClient | undefined,
  kind: NamerTabKind,
  opts?: { dryRun?: boolean }
): Promise<NamerCleanupResult> {
  const dryRun = opts?.dryRun ?? false
  const sheetId = admin ? await resolveNamerSheetId(admin) : null
  const resolvedSheetId =
    sheetId ?? process.env.NAMER_SHEET_ID?.trim() ?? process.env.GDRIVE_NAMER_SHEET_ID?.trim()
  if (!resolvedSheetId) {
    return {
      ok: false,
      tab: kind,
      rowsBefore: 0,
      rowsAfter: 0,
      duplicatesRemoved: 0,
      removedPreview: [],
    }
  }

  const sheets = createGoogleSheetsClient()
  const tabTitles = await listSpreadsheetTabs(sheets, resolvedSheetId)
  const tab = resolveTabTitle(tabTitles, ...NAMER_TAB_CANDIDATES[kind])
  if (!tab) {
    return {
      ok: false,
      tab: kind,
      rowsBefore: 0,
      rowsAfter: 0,
      duplicatesRemoved: 0,
      removedPreview: [],
    }
  }

  const { rows } = await loadTab(resolvedSheetId, tab)
  const rowsBefore = rows.length

  let headerRow = -1
  let headers: string[] = []
  let dedupeConfig: DedupeConfig

  if (kind === "ad") {
    const headerInfo = findCreativeBuilderHeader(rows)
    if (!headerInfo) {
      return { ok: false, tab, rowsBefore, rowsAfter: rowsBefore, duplicatesRemoved: 0, removedPreview: [] }
    }
    headerRow = headerInfo.headerRow
    headers = headerInfo.headers
    dedupeConfig = {
      keyCols: [
        HEADER_PATTERNS.assetUuid,
        HEADER_PATTERNS.adName,
        HEADER_PATTERNS.platformAdId,
        [/^ad id$/i, /^test$/i, /^format$/i, /^size$/i],
      ],
      keepBlankKeys: true,
    }
  } else if (kind === "campaign") {
    const headerInfo = findHeaderRowCampaignAdSet(rows)
    if (!headerInfo) {
      return { ok: false, tab, rowsBefore, rowsAfter: rowsBefore, duplicatesRemoved: 0, removedPreview: [] }
    }
    headerRow = headerInfo.headerRow
    headers = headerInfo.headers
    dedupeConfig = {
      keyCols: [
        HEADER_PATTERNS.thrmlCampaignId,
        HEADER_PATTERNS.platformCampaignId,
      ],
      keepBlankKeys: true,
    }
  } else {
    const headerInfo = findHeaderRowCampaignAdSet(rows)
    if (!headerInfo) {
      return { ok: false, tab, rowsBefore, rowsAfter: rowsBefore, duplicatesRemoved: 0, removedPreview: [] }
    }
    headerRow = headerInfo.headerRow
    headers = headerInfo.headers
    dedupeConfig = {
      keyCols: [
        HEADER_PATTERNS.thrmlAdSetId,
        HEADER_PATTERNS.platformAdSetId,
        [/^ad set id$/i, /^campaign id$/i],
      ],
      keepBlankKeys: true,
    }
  }

  const { kept, removed, duplicatesRemoved } = dedupeRows(rows, headerRow, headers, dedupeConfig)

  if (!dryRun && duplicatesRemoved > 0) {
    await replaceTabValues(sheets, resolvedSheetId, tab, kept)
  }

  return {
    ok: true,
    tab,
    rowsBefore,
    rowsAfter: kept.length,
    duplicatesRemoved,
    removedPreview: removed.slice(0, 8),
  }
}

export async function dedupeAllNamerTabs(
  admin: SupabaseClient | undefined,
  opts?: { dryRun?: boolean }
): Promise<NamerCleanupResult[]> {
  const kinds: NamerTabKind[] = ["campaign", "ad_set", "ad"]
  const results: NamerCleanupResult[] = []
  for (const kind of kinds) {
    results.push(await dedupeNamerTab(admin, kind, opts))
  }
  return results
}

/** Rename header label in-place when old label exists and new does not. */
export async function migrateAdBuilderHeaderLabels(
  admin: SupabaseClient | undefined,
  opts?: { dryRun?: boolean }
): Promise<{ ok: boolean; changes: string[] }> {
  const dryRun = opts?.dryRun ?? false
  const sheetId = admin ? await resolveNamerSheetId(admin) : null
  const resolvedSheetId =
    sheetId ?? process.env.NAMER_SHEET_ID?.trim() ?? process.env.GDRIVE_NAMER_SHEET_ID?.trim()
  if (!resolvedSheetId) return { ok: false, changes: [] }

  const sheets = createGoogleSheetsClient()
  const tabTitles = await listSpreadsheetTabs(sheets, resolvedSheetId)
  const tab = resolveTabTitle(tabTitles, ...NAMER_TAB_CANDIDATES.ad)
  if (!tab) return { ok: false, changes: [] }

  const rows = await readSheetValues(sheets, resolvedSheetId, tab)
  const headerInfo = findCreativeBuilderHeader(rows)
  if (!headerInfo) return { ok: false, changes: [] }

  const headers = [...headerInfo.headers]
  const changes: string[] = []
  const renames: [RegExp, string][] = [
    [/^campaign name \(ref\)$/i, "Campaign ID"],
  ]

  for (const [pattern, nextLabel] of renames) {
    const idx = headers.findIndex((h) => pattern.test(h))
    if (idx < 0) continue
    if (headers.some((h) => h.toLowerCase() === nextLabel.toLowerCase())) continue
    headers[idx] = nextLabel
    changes.push(`Renamed column ${idx + 1} → ${nextLabel}`)
  }

  const ensure = ["Platform Campaign ID", "Platform Ad Set ID"]
  for (const label of ensure) {
    if (!headers.some((h) => h.toLowerCase() === label.toLowerCase())) {
      headers.push(label)
      changes.push(`Added column ${label}`)
    }
  }

  if (!changes.length) return { ok: true, changes: [] }
  if (dryRun) return { ok: true, changes }

  const escaped = tab.replace(/'/g, "''")
  const endCol = columnToLetter(headers.length - 1)
  const row1 = headerInfo.headerRow + 1
  await batchWriteCells(sheets, resolvedSheetId, [
    {
      range: `'${escaped}'!A${row1}:${endCol}${row1}`,
      values: [headers],
    },
  ])

  return { ok: true, changes }
}
