/**
 * Google Sheets formulas for thrml_namer_v4 auto-name columns.
 * Matches the live sheet layout (inspect via scripts/inspect-namer-sheet.ts).
 */

import { columnToLetter } from "@/lib/agent/google-sheets-client"

function colIndex(headers: string[], patterns: readonly RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] ?? "").trim()
    if (patterns.some((p) => p.test(h))) return i
  }
  return -1
}

function colRef(headers: string[], patterns: readonly RegExp[], row1Based: number): string | null {
  const idx = colIndex(headers, patterns)
  if (idx < 0) return null
  return `$${columnToLetter(idx)}${row1Based}`
}

function normalizeTestIdExpr(testRef: string): string {
  return `IF(LEFT(${testRef},1)="T",${testRef},"T"&TEXT(VALUE(${testRef}),"00"))`
}

/** Title-case format type: Static / Video (matches convention_name tokens). */
function formatTypeCaseExpr(formatRef: string): string {
  return `UPPER(LEFT(${formatRef},1))&LOWER(MID(${formatRef},2,99))`
}

function formatTokenExpr(
  formatRef: string,
  sizeRef: string | null,
  videoLengthRef: string | null
): string {
  const fmt = formatTypeCaseExpr(formatRef)
  if (sizeRef && videoLengthRef) {
    return `IF(${formatRef}="Video",${fmt}&"_"&${videoLengthRef},${fmt}&"_"&IF(OR(${sizeRef}="NA",${sizeRef}=""),"1x1",${sizeRef}))`
  }
  return fmt
}

const CAMP_ID = [/^camp id$/i, /^campaign id$/i]
const AD_SET_ID = [/^adset id$/i, /^ad set id$/i]
const AD_ID = [/^ad id$/i]
const AD_NAME_AUTO = [/→?\s*ad name/i, /^ad name \(auto\)$/i]
const CAMP_NAME_AUTO = [/→?\s*campaign name/i, /^campaign name \(auto\)$/i]
const AD_SET_NAME_AUTO = [/→?\s*ad set name/i, /^ad set name \(auto\)$/i]

/**
 * Ad Builder — live layout row 3:
 * Ad ID | AdSet ID | Campaign ID | ANGLE | FORMAT | Size | Video Length | CTA | TEST | VAR | Ad Name (auto) | ...
 *
 * Ad Name = {AdID}_{TEST}_{VAR}_{ANGLE}_{FORMAT token}_{CTA}
 */
export function buildAdBuilderAutoNameFormula(headers: string[], row1Based: number): string | null {
  const adId = colRef(headers, AD_ID, row1Based)
  const test = colRef(headers, [/^test$/i, /^test id$/i], row1Based)
  const variant = colRef(headers, [/^var$/i, /^variant$/i], row1Based)
  const angle = colRef(headers, [/^angle$/i], row1Based)
  const format = colRef(headers, [/^format$/i, /^format type$/i], row1Based)
  const size = colRef(headers, [/^size$/i, /^aspect ratio$/i], row1Based)
  const videoLength = colRef(headers, [/^video length$/i, /^length$/i], row1Based)
  const cta = colRef(headers, [/^cta$/i], row1Based)

  if (!test || !variant || !angle || !format || !cta) return null

  const testNorm = normalizeTestIdExpr(test)
  const formatToken = formatTokenExpr(format, size, videoLength)
  const idPrefix = adId ? `UPPER(${adId})&"_"&` : ""

  return `=IF(OR(${test}="",${variant}=""),"",${idPrefix}${testNorm}&"_"&UPPER(${variant})&"_"&LOWER(${angle})&"_"&${formatToken}&"_"&LOWER(${cta}))`
}

/**
 * Campaign Builder — live layout:
 * Camp ID | PLATFORM | PERSONA | SERVICE | GEO | PHASE | FUNNEL | EVENT | LAUNCH | ... | Campaign Name (auto)
 *
 * e.g. C001_META_host_sauna_SEA_P1_PROSP_BH_2026W19
 */
export function buildCampaignAutoNameFormula(headers: string[], row1Based: number): string | null {
  const campId = colRef(headers, CAMP_ID, row1Based)
  const platform = colRef(headers, [/^platform$/i], row1Based)
  const persona = colRef(headers, [/^persona$/i, /^audience type$/i], row1Based)
  const service = colRef(headers, [/^service$/i, /^space type$/i], row1Based)
  const geo = colRef(headers, [/^geo$/i], row1Based)
  const phase = colRef(headers, [/^phase$/i], row1Based)
  const funnel = colRef(headers, [/^funnel$/i], row1Based)
  const event = colRef(headers, [/^event$/i, /^opt\.?\s*event$/i], row1Based)
  const launch = colRef(headers, [/^launch$/i], row1Based)

  if (!campId || !platform) return null

  const parts = [
    campId,
    `UPPER(${platform})`,
    persona ? `LOWER(${persona})` : null,
    service ? `LOWER(${service})` : null,
    geo ? `UPPER(${geo})` : null,
    phase ?? null,
    funnel ? `UPPER(${funnel})` : null,
    event ? `UPPER(${event})` : null,
    launch ?? null,
  ].filter(Boolean)

  return `=IF(${campId}="","",${parts.join('&"_"&')})`
}

/**
 * Ad Set Builder — live layout:
 * AdSet ID | Camp ID | Campaign Name (ref) | AUDIENCE_SRC | PLACEMENT | Ad Set Name (auto) | ...
 *
 * e.g. AS001_int-sauna_FEED-STORIES
 */
export function buildAdSetAutoNameFormula(
  headers: string[],
  row1Based: number,
  _campaignTabTitle = "Campaign Builder"
): string | null {
  const adSetId = colRef(headers, AD_SET_ID, row1Based)
  const audSrc = colRef(headers, [/^audience.?src$/i, /^audience_src$/i], row1Based)
  const placement = colRef(headers, [/^placement$/i], row1Based)

  if (!adSetId) return null

  const parts = [
    adSetId,
    audSrc ? `LOWER(${audSrc})` : null,
    placement ?? null,
  ].filter(Boolean)

  return `=IF(${adSetId}="","",${parts.join('&"_"&')})`
}

export function autoNameColumnIndex(
  headers: string[],
  kind: "campaign" | "ad_set" | "ad"
): number {
  const patterns =
    kind === "campaign" ? CAMP_NAME_AUTO : kind === "ad_set" ? AD_SET_NAME_AUTO : AD_NAME_AUTO
  return colIndex(headers, patterns)
}

export function isSheetFormula(value: string): boolean {
  return value.trim().startsWith("=")
}

/** Locate header row on Campaign / Ad Set tabs (title + notes rows above). */
/** Escape single quotes in tab titles for Sheets formula string literals. */
function sheetTabRef(tabTitle: string): string {
  return `'${tabTitle.replace(/'/g, "''")}'`
}

/**
 * Ad Set Builder — Campaign Name (ref) from Camp ID via Campaign Builder.
 * Header row on both tabs is row 3 in the live sheet.
 */
export function buildAdSetCampaignRefFormula(
  headers: string[],
  row1Based: number,
  campaignTabTitle = "Campaign Builder"
): string | null {
  const campId = colRef(headers, [/^camp id$/i, /^campaign id$/i], row1Based)
  if (!campId) return null
  const campTab = sheetTabRef(campaignTabTitle)
  return `=IF(${campId}="","",IFERROR(VLOOKUP(${campId},${campTab}!$A:$M,13,FALSE),""))`
}

/**
 * Ad Builder — AdSet ID from Platform Ad Set ID (column V in live layout).
 * Leaves B blank until a platform ID is pasted or namer-sync fills it.
 */
export function buildAdBuilderAdSetIdFormula(
  headers: string[],
  row1Based: number,
  adSetTabTitle = "Ad Set Builder"
): string | null {
  const platformAdSetId = colRef(headers, [/^platform ad set id$/i, /^platform adset id$/i], row1Based)
  if (!platformAdSetId) return null
  const adSetTab = sheetTabRef(adSetTabTitle)
  return `=IF(${platformAdSetId}="","",IFERROR(INDEX(${adSetTab}!$A:$A,MATCH(${platformAdSetId},${adSetTab}!$I:$I,0)),""))`
}

/**
 * Ad Builder — Campaign ID (Camp ID) from AdSet ID via Ad Set Builder.
 */
export function buildAdBuilderCampaignIdFormula(
  headers: string[],
  row1Based: number,
  adSetTabTitle = "Ad Set Builder"
): string | null {
  const adSetId = colRef(headers, AD_SET_ID, row1Based)
  if (!adSetId) return null
  const adSetTab = sheetTabRef(adSetTabTitle)
  return `=IF(${adSetId}="","",IFERROR(VLOOKUP(${adSetId},${adSetTab}!$A:$B,2,FALSE),""))`
}

export function campaignRefColumnIndex(headers: string[]): number {
  return colIndex(headers, [/^campaign name \(ref\)$/i])
}

export function adSetIdColumnIndex(headers: string[]): number {
  return colIndex(headers, AD_SET_ID)
}

export function campaignIdColumnIndex(headers: string[]): number {
  return colIndex(headers, CAMP_ID)
}

export function findRegistryHeaderRow(rows: string[][]): { headerRow: number; headers: string[] } | null {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const line = (rows[r] ?? []).map((c) => String(c).trim())
    const joined = line.join("|").toLowerCase()
    if (
      (joined.includes("camp id") || joined.includes("campaign id")) &&
      (joined.includes("campaign name") || joined.includes("platform"))
    ) {
      return { headerRow: r, headers: line }
    }
    if (joined.includes("adset id") && joined.includes("ad set name")) {
      return { headerRow: r, headers: line }
    }
  }
  return null
}
