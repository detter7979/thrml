/**
 * Apply auto-name formulas to thrml_namer_v4 tabs via Google Sheets API (USER_ENTERED).
 */

import {
  a1Range,
  columnToLetter,
  createGoogleSheetsClient,
  listSpreadsheetTabs,
  readSheetValues,
  resolveTabTitle,
} from "@/lib/agent/google-sheets-client"
import { findCreativeBuilderHeader, THRML_NAMER_V4_SHEET_ID } from "@/lib/agent/namer-creative-append"
import { allocateNextThrmlLegacyId } from "@/lib/agent/namer-legacy-ids"
import { NAMER_TAB_CANDIDATES } from "@/lib/agent/namer-sheet-schema"
import {
  adSetIdColumnIndex,
  autoNameColumnIndex,
  buildAdBuilderAdSetIdFormula,
  buildAdBuilderAutoNameFormula,
  buildAdBuilderCampaignIdFormula,
  buildAdSetAutoNameFormula,
  buildAdSetCampaignRefFormula,
  buildCampaignAutoNameFormula,
  campaignIdColumnIndex,
  campaignRefColumnIndex,
  findRegistryHeaderRow,
  isSheetFormula,
} from "@/lib/agent/namer-sheet-formulas"

export type ApplyFormulasResult = {
  tab: string
  headerRow: number
  autoNameCol: string
  rowsUpdated: number
  adIdsAllocated?: number
}

function colIndex(headers: string[], patterns: readonly RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (patterns.some((p) => p.test((headers[i] ?? "").trim()))) return i
  }
  return -1
}

async function batchWriteUserEntered(
  spreadsheetId: string,
  updates: { range: string; values: string[][] }[]
) {
  if (!updates.length) return
  const sheets = createGoogleSheetsClient()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: updates.map((u) => ({ range: u.range, values: u.values })),
    },
  })
}

function isDataRow(row: string[], keyCol: number): boolean {
  if (keyCol < 0) return false
  const key = (row[keyCol] ?? "").trim()
  if (!key) return false
  if (/^→|^status:/i.test(key)) return false
  return true
}

export async function applyCampaignFormulas(
  spreadsheetId: string,
  tabTitle: string
): Promise<ApplyFormulasResult> {
  const sheets = createGoogleSheetsClient()
  const rows = await readSheetValues(sheets, spreadsheetId, tabTitle)
  const header = findRegistryHeaderRow(rows)
  if (!header) throw new Error(`Campaign header not found on ${tabTitle}`)

  const nameCol = autoNameColumnIndex(header.headers, "campaign")
  if (nameCol < 0) throw new Error("Campaign Name (auto) column not found")

  const keyCol = colIndex(header.headers, [/^camp id$/i, /^campaign id$/i])
  const updates: { range: string; values: string[][] }[] = []

  for (let r = header.headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    if (!isDataRow(row, keyCol)) continue
    const row1 = r + 1
    const formula = buildCampaignAutoNameFormula(header.headers, row1)
    if (!formula) continue
    updates.push({
      range: a1Range(tabTitle, nameCol, row1),
      values: [[formula]],
    })
  }

  await batchWriteUserEntered(spreadsheetId, updates)

  return {
    tab: tabTitle,
    headerRow: header.headerRow + 1,
    autoNameCol: columnToLetter(nameCol),
    rowsUpdated: updates.length,
  }
}

export async function applyAdSetFormulas(
  spreadsheetId: string,
  tabTitle: string,
  campaignTabTitle: string
): Promise<ApplyFormulasResult> {
  const sheets = createGoogleSheetsClient()
  const rows = await readSheetValues(sheets, spreadsheetId, tabTitle)
  const header = findRegistryHeaderRow(rows)
  if (!header) throw new Error(`Ad Set header not found on ${tabTitle}`)

  const nameCol = autoNameColumnIndex(header.headers, "ad_set")
  if (nameCol < 0) throw new Error("Ad Set Name (auto) column not found")

  const keyCol = colIndex(header.headers, [/^adset id$/i, /^ad set id$/i])
  const refCol = campaignRefColumnIndex(header.headers)
  const updates: { range: string; values: string[][] }[] = []

  for (let r = header.headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    if (!isDataRow(row, keyCol)) continue
    const row1 = r + 1
    const formula = buildAdSetAutoNameFormula(header.headers, row1, campaignTabTitle)
    if (!formula) continue
    updates.push({
      range: a1Range(tabTitle, nameCol, row1),
      values: [[formula]],
    })

    if (refCol >= 0) {
      const refFormula = buildAdSetCampaignRefFormula(header.headers, row1, campaignTabTitle)
      if (refFormula) {
        updates.push({
          range: a1Range(tabTitle, refCol, row1),
          values: [[refFormula]],
        })
      }
    }
  }

  await batchWriteUserEntered(spreadsheetId, updates)

  return {
    tab: tabTitle,
    headerRow: header.headerRow + 1,
    autoNameCol: columnToLetter(nameCol),
    rowsUpdated: updates.length,
  }
}

export async function applyAdBuilderFormulas(
  spreadsheetId: string,
  tabTitle: string,
  adSetTabTitle: string,
  opts?: { allocateAdIds?: boolean }
): Promise<ApplyFormulasResult> {
  const sheets = createGoogleSheetsClient()
  const rows = await readSheetValues(sheets, spreadsheetId, tabTitle)
  const headerInfo = findCreativeBuilderHeader(rows)
  if (!headerInfo) throw new Error(`Ad Builder header not found on ${tabTitle}`)

  const { headers, headerRow } = headerInfo
  const nameCol = autoNameColumnIndex(headers, "ad")
  if (nameCol < 0) throw new Error("Ad Name (auto) column not found")

  const adIdCol = colIndex(headers, [/^ad id$/i])
  const testCol = colIndex(headers, [/^test$/i, /^test id$/i])
  const adSetIdCol = adSetIdColumnIndex(headers)
  const campaignIdCol = campaignIdColumnIndex(headers)
  const platformAdSetIdCol = colIndex(headers, [/^platform ad set id$/i, /^platform adset id$/i])

  const updates: { range: string; values: string[][] }[] = []
  let adIdsAllocated = 0

  const existingAdIds: string[] = []
  for (let r = headerRow + 1; r < rows.length; r++) {
    const v = (rows[r]?.[adIdCol] ?? "").trim()
    if (v) existingAdIds.push(v)
  }

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const hasTest = testCol >= 0 && (row[testCol] ?? "").trim()
    const hasAngle = colIndex(headers, [/^angle$/i]) >= 0 && (row[colIndex(headers, [/^angle$/i])] ?? "").trim()
    if (!hasTest && !hasAngle) continue

    const row1 = r + 1

    if (opts?.allocateAdIds && adIdCol >= 0 && !(row[adIdCol] ?? "").trim()) {
      const nextId = allocateNextThrmlLegacyId(existingAdIds, "ad")
      existingAdIds.push(nextId)
      updates.push({
        range: a1Range(tabTitle, adIdCol, row1),
        values: [[nextId]],
      })
      adIdsAllocated++
    }

    const formula = buildAdBuilderAutoNameFormula(headers, row1)
    if (formula) {
      updates.push({
        range: a1Range(tabTitle, nameCol, row1),
        values: [[formula]],
      })
    }

    const platformAdSetId = platformAdSetIdCol >= 0 ? (row[platformAdSetIdCol] ?? "").trim() : ""
    const adSetIdCell = adSetIdCol >= 0 ? (row[adSetIdCol] ?? "").trim() : ""
    const adSetIdFormula = buildAdBuilderAdSetIdFormula(headers, row1, adSetTabTitle)
    if (
      adSetIdCol >= 0 &&
      adSetIdFormula &&
      (platformAdSetId || !adSetIdCell || isSheetFormula(adSetIdCell))
    ) {
      updates.push({
        range: a1Range(tabTitle, adSetIdCol, row1),
        values: [[adSetIdFormula]],
      })
    }

    const campaignIdFormula = buildAdBuilderCampaignIdFormula(headers, row1, adSetTabTitle)
    if (campaignIdCol >= 0 && campaignIdFormula) {
      updates.push({
        range: a1Range(tabTitle, campaignIdCol, row1),
        values: [[campaignIdFormula]],
      })
    }
  }

  await batchWriteUserEntered(spreadsheetId, updates)

  return {
    tab: tabTitle,
    headerRow: headerRow + 1,
    autoNameCol: columnToLetter(nameCol),
    rowsUpdated: updates.filter((u) => u.range.includes(columnToLetter(nameCol))).length,
    adIdsAllocated,
  }
}

export async function applyAllNamerFormulas(
  spreadsheetId: string = THRML_NAMER_V4_SHEET_ID,
  opts?: { allocateAdIds?: boolean }
): Promise<ApplyFormulasResult[]> {
  const sheets = createGoogleSheetsClient()
  const tabs = await listSpreadsheetTabs(sheets, spreadsheetId)

  const campaignTab = resolveTabTitle(tabs, ...NAMER_TAB_CANDIDATES.campaign)
  const adSetTab = resolveTabTitle(tabs, ...NAMER_TAB_CANDIDATES.ad_set)
  const adTab = resolveTabTitle(tabs, ...NAMER_TAB_CANDIDATES.ad)

  if (!campaignTab || !adSetTab || !adTab) {
    throw new Error(`Missing tab(s). Found: ${tabs.join(", ")}`)
  }

  const results: ApplyFormulasResult[] = []
  results.push(await applyCampaignFormulas(spreadsheetId, campaignTab))
  results.push(await applyAdSetFormulas(spreadsheetId, adSetTab, campaignTab))
  results.push(await applyAdBuilderFormulas(spreadsheetId, adTab, adSetTab, opts))
  return results
}
