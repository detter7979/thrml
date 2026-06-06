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
import {
  cellValue,
  colIndex,
  findAdSetBuilderHeader,
  findCampaignBuilderHeader,
} from "@/lib/agent/namer-header-utils"
import { parseAdSetConventionName } from "@/lib/agent/namer-convention-parse"
import {
  buildAdSetAutoNameFormula,
  buildAdSetCampaignRefFormula,
  buildCampaignAutoNameFormula,
} from "@/lib/agent/namer-sheet-formulas"
import { HEADER_PATTERNS, NAMER_TAB_CANDIDATES } from "@/lib/agent/namer-sheet-schema"

function collectColumnValues(rows: string[][], headers: string[], patterns: RegExp[]): string[] {
  const col = colIndex(headers, patterns)
  if (col < 0) return []
  return rows.map((row) => (row[col] ?? "").trim()).filter(Boolean)
}

function findRowByPlatformId(
  rows: string[][],
  headerRow: number,
  headers: string[],
  platformPatterns: readonly RegExp[],
  platformId: string
): number {
  const col = colIndex(headers, platformPatterns)
  if (col < 0) return -1
  const target = platformId.replace(/\D/g, "").trim()
  for (let r = headerRow + 1; r < rows.length; r++) {
    const raw = (rows[r]?.[col] ?? "").trim().replace(/\D/g, "")
    if (raw && raw === target) return r
  }
  return -1
}

async function resolveCampaignThrmlIdFromSheet(
  sheetId: string,
  campaignPlatformId: string
): Promise<string> {
  const sheets = createGoogleSheetsClient()
  const tabs = await listSpreadsheetTabs(sheets, sheetId)
  const tab = resolveTabTitle(tabs, ...NAMER_TAB_CANDIDATES.campaign)
  if (!tab) return ""

  const rows = await readSheetValues(sheets, sheetId, tab)
  const header = findCampaignBuilderHeader(rows)
  if (!header) return ""

  const rowIdx = findRowByPlatformId(
    rows,
    header.headerRow,
    header.headers,
    HEADER_PATTERNS.platformCampaignId,
    campaignPlatformId
  )
  if (rowIdx < 0) return ""
  return cellValue(rows[rowIdx] ?? [], header.headers, HEADER_PATTERNS.thrmlCampaignId)
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
  const header = findCampaignBuilderHeader(rows)
  if (!header) return { ok: false, reason: "Campaign Builder header not found" }

  const dataRows = rows.slice(header.headerRow + 1)
  const existingCampaignIds = collectColumnValues(dataRows, header.headers, HEADER_PATTERNS.thrmlCampaignId)
  const thrmlId = allocateNextThrmlLegacyId(existingCampaignIds, "campaign")

  const values = new Array(header.headers.length).fill("")
  const set = (patterns: readonly RegExp[], value: string) => {
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
  const campaignNameCol = colIndex(header.headers, [/^campaign name/i])
  if (campaignNameCol >= 0) {
    const row1 = existingRow >= 0 ? existingRow + 1 : header.headerRow + dataRows.length + 2
    const formula = buildCampaignAutoNameFormula(header.headers, row1)
    if (formula) values[campaignNameCol] = formula
    else if (row.campaign_name?.trim()) values[campaignNameCol] = row.campaign_name.trim()
  }
  set([/^platform$/i], "META")
  set([/^persona$/i], row.aud_type?.trim().toLowerCase() === "guest" ? "guest" : "host")
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
  const header = findAdSetBuilderHeader(rows)
  if (!header) return { ok: false, reason: "Ad Set Builder header not found" }

  const dataRows = rows.slice(header.headerRow + 1)
  const existingAdSetIds = collectColumnValues(dataRows, header.headers, HEADER_PATTERNS.thrmlAdSetId)
  const thrmlId = allocateNextThrmlLegacyId(existingAdSetIds, "ad_set")

  let campaignThrmlId = ""
  if (row.campaign_platform_id?.trim()) {
    campaignThrmlId = await resolveCampaignThrmlIdFromSheet(sheetId, row.campaign_platform_id.trim())
  }

  const parsedAdSet = row.adset_name?.trim()
    ? parseAdSetConventionName(row.adset_name.trim())
    : null

  const values = new Array(header.headers.length).fill("")
  const set = (patterns: readonly RegExp[], value: string) => {
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

  const adSetNameCol = colIndex(header.headers, [/^ad set name/i])
  if (adSetNameCol >= 0) {
    const row1 = existingRow >= 0 ? existingRow + 1 : header.headerRow + dataRows.length + 2
    const formula = buildAdSetAutoNameFormula(header.headers, row1)
    if (formula) values[adSetNameCol] = formula
    else if (row.adset_name?.trim()) values[adSetNameCol] = row.adset_name.trim()
  }

  if (parsedAdSet) {
    set([/^audience.?src$/i, /^audience_src$/i], parsedAdSet.audience_src)
    set([/^placement$/i], parsedAdSet.placement)
  }

  const refCol = colIndex(header.headers, [/^campaign name \(ref\)$/i])
  if (refCol >= 0 && campaignThrmlId) {
    const row1 = existingRow >= 0 ? existingRow + 1 : header.headerRow + dataRows.length + 2
    const refFormula = buildAdSetCampaignRefFormula(header.headers, row1)
    if (refFormula) values[refCol] = refFormula
  }

  set([/^audience details/i, /^notes$/i], row.audience_desc?.trim() ?? "")
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
