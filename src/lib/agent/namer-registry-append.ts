/**
 * Best-effort upsert of campaign_registry / adset_registry rows into namer Campaign & Ad Set Builder tabs.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  batchWriteCells,
  columnToLetter,
  createGoogleSheetsClient,
  listSpreadsheetTabs,
  readSheetValues,
  resolveTabTitle,
} from "@/lib/agent/google-sheets-client"
import { allocateNextThrmlLegacyId } from "@/lib/agent/namer-legacy-ids"
import { resolveNamerSheetId } from "@/lib/agent/namer-creative-append"
import { HEADER_PATTERNS, NAMER_TAB_CANDIDATES } from "@/lib/agent/namer-sheet-schema"

function colIndex(headers: string[], patterns: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (patterns.some((p) => p.test(headers[i] ?? ""))) return i
  }
  return -1
}

function findHeaderRow(rows: string[][]): { headerRow: number; headers: string[] } | null {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const line = rows[r] ?? []
    const joined = line.join(" ").toLowerCase()
    if (joined.includes("campaign id") || joined.includes("ad set id")) {
      return { headerRow: r, headers: line.map((c) => String(c).trim()) }
    }
  }
  return null
}

function collectColumnValues(rows: string[][], headers: string[], patterns: RegExp[]): string[] {
  const col = colIndex(headers, patterns)
  if (col < 0) return []
  return rows.map((row) => (row[col] ?? "").trim()).filter(Boolean)
}

function findRowByPlatformId(
  rows: string[][],
  headerRow: number,
  headers: string[],
  platformPatterns: RegExp[],
  platformId: string
): number {
  const col = colIndex(headers, platformPatterns)
  if (col < 0) return -1
  for (let r = headerRow + 1; r < rows.length; r++) {
    if ((rows[r]?.[col] ?? "").trim() === platformId) return r
  }
  return -1
}

export async function upsertCampaignRegistryInNamer(
  admin: SupabaseClient,
  row: {
    platform_id: string
    campaign_name?: string | null
    objective?: string | null
    aud_type?: string | null
    market?: string | null
    status?: string | null
    agent_managed?: boolean | null
  }
): Promise<{ ok: boolean; reason?: string }> {
  const platformId = row.platform_id?.trim()
  if (!platformId || platformId.startsWith("pending-")) {
    return { ok: true, reason: "No live platform campaign id" }
  }

  const sheetId = await resolveNamerSheetId(admin)
  if (!sheetId) return { ok: true, reason: "NAMER_SHEET_ID not configured" }

  const sheets = createGoogleSheetsClient()
  const tabs = await listSpreadsheetTabs(sheets, sheetId)
  const tab = resolveTabTitle(tabs, ...NAMER_TAB_CANDIDATES.campaign)
  if (!tab) return { ok: false, reason: "Campaign Builder tab not found" }

  const rows = await readSheetValues(sheets, sheetId, tab)
  const header = findHeaderRow(rows)
  if (!header) return { ok: false, reason: "Campaign Builder header not found" }

  const dataRows = rows.slice(header.headerRow + 1)
  const existingCampaignIds = collectColumnValues(dataRows, header.headers, HEADER_PATTERNS.thrmlCampaignId)
  const thrmlId = allocateNextThrmlLegacyId(existingCampaignIds, "campaign")

  const values = new Array(header.headers.length).fill("")
  const set = (patterns: RegExp[], value: string) => {
    const idx = colIndex(header.headers, patterns)
    if (idx >= 0 && value) values[idx] = value
  }

  const existingRow = findRowByPlatformId(
    rows,
    header.headerRow,
    header.headers,
    HEADER_PATTERNS.platformCampaignId,
    platformId
  )

  set(HEADER_PATTERNS.thrmlCampaignId, existingRow >= 0 ? "" : thrmlId)
  set(HEADER_PATTERNS.platformCampaignId, platformId)
  set([/^campaign name/i], row.campaign_name?.trim() ?? "")
  set([/^platform$/i], "META")
  set([/^objective$/i], row.objective?.trim() ?? "")
  set([/^audience type$/i], row.aud_type?.trim() ?? "")
  set([/^geo$/i], row.market?.trim() ?? "")
  set([/^status$/i], row.status?.trim() ?? "DRAFT")
  set([/^campaign gen$/i], row.agent_managed === false ? "Human" : "Bot")

  const escaped = tab.replace(/'/g, "''")
  const endCol = columnToLetter(header.headers.length - 1)

  if (existingRow >= 0) {
    const row1 = existingRow + 1
    const thrmlCol = colIndex(header.headers, HEADER_PATTERNS.thrmlCampaignId)
    if (thrmlCol >= 0) values[thrmlCol] = (rows[existingRow]?.[thrmlCol] ?? "").trim()
    await batchWriteCells(sheets, sheetId, [
      { range: `'${escaped}'!A${row1}:${endCol}${row1}`, values: [values] },
    ])
    return { ok: true }
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `'${escaped}'!A:${endCol}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  })
  return { ok: true }
}

export async function upsertAdSetRegistryInNamer(
  admin: SupabaseClient,
  row: {
    platform_id: string
    campaign_platform_id?: string | null
    adset_name?: string | null
    audience_desc?: string | null
    status?: string | null
    agent_managed?: boolean | null
  }
): Promise<{ ok: boolean; reason?: string }> {
  const platformId = row.platform_id?.trim()
  if (!platformId) return { ok: true, reason: "No platform ad set id" }

  const sheetId = await resolveNamerSheetId(admin)
  if (!sheetId) return { ok: true, reason: "NAMER_SHEET_ID not configured" }

  const sheets = createGoogleSheetsClient()
  const tabs = await listSpreadsheetTabs(sheets, sheetId)
  const tab = resolveTabTitle(tabs, ...NAMER_TAB_CANDIDATES.ad_set)
  if (!tab) return { ok: false, reason: "Ad Set Builder tab not found" }

  const rows = await readSheetValues(sheets, sheetId, tab)
  const header = findHeaderRow(rows)
  if (!header) return { ok: false, reason: "Ad Set Builder header not found" }

  const dataRows = rows.slice(header.headerRow + 1)
  const existingAdSetIds = collectColumnValues(dataRows, header.headers, HEADER_PATTERNS.thrmlAdSetId)
  const thrmlId = allocateNextThrmlLegacyId(existingAdSetIds, "ad_set")

  let campaignThrmlId = ""
  if (row.campaign_platform_id?.trim()) {
    const campRow = findRowByPlatformId(
      rows,
      header.headerRow,
      header.headers,
      HEADER_PATTERNS.platformCampaignId,
      row.campaign_platform_id.trim()
    )
    // Campaign tab lookup would be better — leave Campaign ID blank if not on ad set sheet
    void campRow
  }

  const values = new Array(header.headers.length).fill("")
  const set = (patterns: RegExp[], value: string) => {
    const idx = colIndex(header.headers, patterns)
    if (idx >= 0 && value) values[idx] = value
  }

  const existingRow = findRowByPlatformId(
    rows,
    header.headerRow,
    header.headers,
    HEADER_PATTERNS.platformAdSetId,
    platformId
  )

  set(HEADER_PATTERNS.thrmlAdSetId, existingRow >= 0 ? "" : thrmlId)
  set(HEADER_PATTERNS.thrmlCampaignId, campaignThrmlId)
  set(HEADER_PATTERNS.platformAdSetId, platformId)
  set(HEADER_PATTERNS.platformCampaignId, row.campaign_platform_id?.trim() ?? "")
  set([/^ad set name/i], row.adset_name?.trim() ?? "")
  set([/^audience details/i], row.audience_desc?.trim() ?? "")
  set([/^status$/i], row.status?.trim() ?? "DRAFT")
  set([/^ad set gen$/i], row.agent_managed === false ? "Human" : "Bot")

  const escaped = tab.replace(/'/g, "''")
  const endCol = columnToLetter(header.headers.length - 1)

  if (existingRow >= 0) {
    const row1 = existingRow + 1
    const thrmlCol = colIndex(header.headers, HEADER_PATTERNS.thrmlAdSetId)
    if (thrmlCol >= 0) values[thrmlCol] = (rows[existingRow]?.[thrmlCol] ?? "").trim()
    await batchWriteCells(sheets, sheetId, [
      { range: `'${escaped}'!A${row1}:${endCol}${row1}`, values: [values] },
    ])
    return { ok: true }
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `'${escaped}'!A:${endCol}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  })
  return { ok: true }
}
