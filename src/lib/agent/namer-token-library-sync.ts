/**
 * Best-effort upsert of pipeline naming tokens into thrml_namer_v4 Token Library.
 * Called when a creative is approved and appended to Ad Builder.
 */

import {
  batchWriteCells,
  createGoogleSheetsClient,
  readSheetValues,
} from "@/lib/agent/google-sheets-client"
import type { NamerCreativeRow } from "@/lib/agent/namer-creative-append"

export const TOKEN_LIBRARY_TAB = "Token Library"

export type PipelineTokenEntry = {
  category: string
  value: string
  definition: string
  status: "DRAFT" | "TEST"
}

export type TokenLibrarySyncResult = {
  ok: boolean
  added: PipelineTokenEntry[]
  skipped: number
  reason?: string
}

type BriefContext = {
  hook?: string | null
  copy_headline?: string | null
  hypothesis?: string | null
  campaign_short_name?: string | null
}

/** Normalize naming tokens for Token Library Value column (snake_case). */
export function normalizePipelineTokenValue(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_")
}

/** Preserve FORMAT casing e.g. Static_9x16, Video_5s. */
export function normalizeFormatTokenValue(raw: string): string {
  const v = raw.trim()
  const staticMatch = /^static_(\d+x\d+)$/i.exec(v)
  if (staticMatch) return `Static_${staticMatch[1].toLowerCase()}`
  const videoMatch = /^video_(\d+s)$/i.exec(v)
  if (videoMatch) return `Video_${videoMatch[1].toLowerCase()}`
  if (/^carousel$/i.test(v)) return "Carousel"
  if (/^ugc$/i.test(v)) return "UGC"
  if (/^rsa$/i.test(v)) return "RSA"
  return v
}

function angleDefinition(row: NamerCreativeRow, brief?: BriefContext): string {
  const fromBrief =
    brief?.hook?.trim() ||
    brief?.copy_headline?.trim() ||
    brief?.hypothesis?.trim() ||
    brief?.campaign_short_name?.trim()
  if (fromBrief) return fromBrief.slice(0, 120)
  return `Creative angle — auto-registered from pipeline (${row.adName})`
}

function formatDefinition(formatToken: string): string {
  const videoMatch = /^Video_(\d+s)$/i.exec(formatToken)
  if (videoMatch) return `${videoMatch[1]} video (pipeline)`
  const staticMatch = /^Static_(\d+x\d+)$/i.exec(formatToken)
  if (staticMatch) return `${staticMatch[1]} static (pipeline)`
  return `Format token — auto-registered from pipeline`
}

/** Tokens to register from an approved creative row. */
export function extractPipelineTokens(
  row: NamerCreativeRow,
  brief?: BriefContext
): PipelineTokenEntry[] {
  const entries: PipelineTokenEntry[] = []
  const status: PipelineTokenEntry["status"] = "TEST"

  const angle = normalizePipelineTokenValue(row.angle)
  if (angle) {
    entries.push({
      category: "ANGLE",
      value: angle,
      definition: angleDefinition(row, brief),
      status,
    })
  }

  const cta = normalizePipelineTokenValue(row.cta)
  if (cta) {
    entries.push({
      category: "CTA",
      value: cta,
      definition: "CTA — auto-registered from pipeline",
      status,
    })
  }

  const formatToken = normalizeFormatTokenValue(row.formatToken)
  if (formatToken) {
    entries.push({
      category: "FORMAT",
      value: formatToken,
      definition: formatDefinition(formatToken),
      status,
    })
  }

  return entries
}

type CategorySection = {
  startRow: number
  endRow: number
  values: Set<string>
}

function findTokenLibraryHeaderRow(rows: string[][]): number {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const a = (rows[r]?.[0] ?? "").trim()
    const b = (rows[r]?.[1] ?? "").trim()
    if (/^token$/i.test(a) && /^value$/i.test(b)) return r
  }
  return 3
}

function findCategorySection(rows: string[][], headerRow: number, category: string): CategorySection | null {
  const target = category.trim().toUpperCase()
  let startRow = -1

  for (let r = headerRow + 1; r < rows.length; r++) {
    const tokenCell = (rows[r]?.[0] ?? "").trim().toUpperCase()
    if (tokenCell === target) {
      startRow = r
      break
    }
  }

  if (startRow < 0) return null

  let endRow = startRow + 1
  while (endRow < rows.length) {
    const nextCategory = (rows[endRow]?.[0] ?? "").trim()
    if (nextCategory) break
    endRow++
  }

  const values = new Set<string>()
  for (let r = startRow; r < endRow; r++) {
    const value = (rows[r]?.[1] ?? "").trim()
    if (value) values.add(value.toLowerCase())
  }

  return { startRow, endRow, values }
}

function compareTokenValue(category: string, value: string): string {
  return category === "FORMAT" ? value : value.toLowerCase()
}

async function resolveTabSheetId(
  sheets: ReturnType<typeof createGoogleSheetsClient>,
  spreadsheetId: string,
  tabTitle: string
): Promise<number | null> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" })
  const sheetId = meta.data.sheets?.find((s) => s.properties?.title === tabTitle)?.properties?.sheetId
  return sheetId ?? null
}

export async function syncPipelineTokensToTokenLibrary(
  spreadsheetId: string,
  row: NamerCreativeRow,
  brief?: BriefContext,
  tabTitle: string = TOKEN_LIBRARY_TAB
): Promise<TokenLibrarySyncResult> {
  const entries = extractPipelineTokens(row, brief)
  if (!entries.length) {
    return { ok: true, added: [], skipped: 0 }
  }

  const sheets = createGoogleSheetsClient()
  let existingRows: string[][]
  try {
    existingRows = await readSheetValues(sheets, spreadsheetId, tabTitle)
  } catch (err) {
    return {
      ok: false,
      added: [],
      skipped: entries.length,
      reason: err instanceof Error ? err.message : "Failed to read Token Library",
    }
  }

  const headerRow = findTokenLibraryHeaderRow(existingRows)
  const toAdd: { entry: PipelineTokenEntry; insertRow0: number }[] = []
  let skipped = 0

  const sectionCache = new Map<string, CategorySection>()

  for (const entry of entries) {
    let section = sectionCache.get(entry.category)
    if (!section) {
      const found = findCategorySection(existingRows, headerRow, entry.category)
      if (!found) {
        skipped++
        continue
      }
      section = found
      sectionCache.set(entry.category, found)
    }

    const compareValue = compareTokenValue(entry.category, entry.value)
    if (section.values.has(compareValue)) {
      skipped++
      continue
    }

    section.values.add(compareValue)
    toAdd.push({ entry, insertRow0: section.endRow })
    section.endRow++
    sectionCache.set(entry.category, section)
  }

  if (!toAdd.length) {
    return { ok: true, added: [], skipped }
  }

  const tabSheetId = await resolveTabSheetId(sheets, spreadsheetId, tabTitle)
  if (tabSheetId == null) {
    return { ok: false, added: [], skipped, reason: "Token Library tab not found" }
  }

  const escapedTab = tabTitle.replace(/'/g, "''")
  const added: PipelineTokenEntry[] = []

  try {
    // Insert bottom-up so row indices stay valid.
    const sorted = [...toAdd].sort((a, b) => b.insertRow0 - a.insertRow0)
    for (const { entry, insertRow0 } of sorted) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              insertDimension: {
                range: {
                  sheetId: tabSheetId,
                  dimension: "ROWS",
                  startIndex: insertRow0,
                  endIndex: insertRow0 + 1,
                },
                inheritFromBefore: true,
              },
            },
          ],
        },
      })

      const row1 = insertRow0 + 1
      await batchWriteCells(sheets, spreadsheetId, [
        {
          range: `'${escapedTab}'!A${row1}:D${row1}`,
          values: [["", entry.value, entry.definition, entry.status]],
        },
      ])
      added.push(entry)
    }
  } catch (err) {
    return {
      ok: false,
      added,
      skipped,
      reason: err instanceof Error ? err.message : "Token Library write failed",
    }
  }

  return { ok: true, added, skipped }
}
