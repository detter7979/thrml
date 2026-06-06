/**
 * Append approved pipeline creatives to thrml_namer_v4 (Creative Builder tab)
 * and persist a JSON snapshot in the creative GCS bucket.
 *
 * Best-effort: callers should not fail asset approval when namer sync is unavailable.
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
import { fetchMetaAd, fetchMetaAdSet } from "@/lib/agent/namer-meta-client"
import { uploadBufferToCreativeObject, refreshCreativeAssetUrl } from "@/lib/agent/gcs"
import { parseAdName } from "@/lib/agent/naming-builder"
import { allocateNextThrmlLegacyId } from "@/lib/agent/namer-legacy-ids"
import {
  AD_BUILDER_ENSURE_COLUMNS,
  HEADER_PATTERNS,
  type MetaPlatformIds,
} from "@/lib/agent/namer-sheet-schema"
import { resolveThrmlLegacyIdsFromPlatform } from "@/lib/agent/namer-thrml-id-resolve"

/** thrml_namer_v4 uses "Ad Builder"; older docs reference "Creative Builder". */
export const CREATIVE_BUILDER_TAB_CANDIDATES = [
  "Ad Builder",
  "② Ad Builder",
  "2 Ad Builder",
  "④ Creative Builder",
  "Creative Builder",
]

/** thrml_namer_v4 — canonical Creative Builder destination. */
export const THRML_NAMER_V4_SHEET_ID = "1bSSZNmE8YENlkUOgHaS689Z1UpU8VAD6j5B0MnQK-HQ"

/** Trailing metadata columns (Ad Builder already has GCS Path). */
export const NAMER_EXTENDED_HEADERS_AD_BUILDER = [
  "Pipeline Template",
  "Brief Input",
  "Creative Gen",
  "Campaign Gen",
  "Ad Set Gen",
  "Asset UUID",
] as const

/** Extended columns when the tab has no native GCS Path column. */
export const NAMER_EXTENDED_HEADERS_WITH_LINK = [
  "Asset GCS Link",
  ...NAMER_EXTENDED_HEADERS_AD_BUILDER,
] as const

/** @deprecated use layout-specific lists */
export const NAMER_EXTENDED_HEADERS = NAMER_EXTENDED_HEADERS_WITH_LINK

const FORMAT_SPLIT: Record<string, [formatType: string, length: string, aspectRatio: string]> = {
  Static_9x16: ["Static", "NA", "9:16"],
  Static_1x1: ["Static", "NA", "1:1"],
  Static_4x5: ["Static", "NA", "4:5"],
  Video_15s: ["Video", "15s", "9:16"],
  Video_30s: ["Video", "30s", "9:16"],
  Video_6s: ["Video", "6s", "9:16"],
  Carousel: ["Carousel", "NA", "1:1"],
  UGC: ["UGC", "NA", "9:16"],
  RSA: ["RSA", "NA", "NA"],
}

export type ProvenanceLabel = "Human" | "Bot" | "Pending"

export type NamerSheetLayout = "ad_builder" | "creative_builder" | "legacy"

export type NamerCreativeRow = {
  adId: string
  adSetId: string
  campaignId: string
  testId: string
  variant: string
  angle: string
  /** Combined naming token e.g. Static_9x16 (convention_name only). */
  formatToken: string
  formatType: string
  /** Aspect size e.g. 9x16, 1x1, 4x5, or NA. */
  sizeToken: string
  length: string
  /** Video duration e.g. 15s, or NA for static. */
  videoLength: string
  aspectRatio: string
  cta: string
  adName: string
  hookPreview: string
  status: string
  platform: string
  phase: string
  optEvent: string
  assetGcsPath: string
  assetGcsLink: string
  pipelineTemplate: string
  assetUuid: string
  briefInput: ProvenanceLabel
  creativeGen: ProvenanceLabel
  campaignGen: ProvenanceLabel
  adSetGen: ProvenanceLabel
}

export type NamerCreativeAppendResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  tabTitle?: string
  gcsExportPath?: string
  assetGcsLink?: string
}

export type { MetaPlatformIds } from "@/lib/agent/namer-sheet-schema"

export type NamerPlatformSyncResult = {
  ok: boolean
  updated: number
  skipped: number
  errors: { assetId: string; reason: string }[]
}

type BriefRow = {
  id: string
  trigger_type: string | null
  trigger_data: Record<string, unknown> | null
  created_by: string | null
  hook: string | null
  copy_headline: string | null
}

type AssetRow = {
  id: string
  brief_id: string | null
  convention_name: string | null
  gcs_path: string | null
  gcs_url: string | null
  format: string | null
  meta_ad_id: string | null
  meta_adset_id: string | null
  namer_synced_at: string | null
}

function requireEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value || null
}

export async function resolveNamerSheetId(admin?: SupabaseClient): Promise<string | null> {
  const fromEnv = requireEnv("NAMER_SHEET_ID") ?? requireEnv("GDRIVE_NAMER_SHEET_ID")
  if (fromEnv) return fromEnv

  if (admin) {
    const { data, error } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "gdrive_namer_sheet_id")
      .maybeSingle()

    if (!error && data) {
      const value = (data as { value?: unknown }).value
      if (typeof value === "string" && value.trim()) return value.trim()
      if (value && typeof value === "object" && "sheetId" in value) {
        const sheetId = (value as { sheetId?: string }).sheetId
        if (sheetId?.trim()) return sheetId.trim()
      }
    }
  }

  return THRML_NAMER_V4_SHEET_ID
}

export function isNamerCreativeAppendConfigured(): boolean {
  return Boolean(requireEnv("NAMER_SHEET_ID") ?? requireEnv("GDRIVE_NAMER_SHEET_ID"))
}

export function splitFormatToken(formatToken: string): [string, string, string] {
  const direct = FORMAT_SPLIT[formatToken]
  if (direct) return direct

  const staticMatch = /^Static_(\d+x\d+)$/.exec(formatToken)
  if (staticMatch) {
    const ratio = staticMatch[1].replace("x", ":")
    return ["Static", "NA", ratio]
  }

  const videoMatch = /^Video_(\d+s)$/.exec(formatToken)
  if (videoMatch) return ["Video", videoMatch[1], "9:16"]

  return [formatToken, "NA", "NA"]
}

export function hookPreview(hook: string | null | undefined): string {
  if (!hook?.trim()) return ""
  return hook.trim().split(/\s+/).slice(0, 3).join(" ")
}

/** Ad Builder hook style — full line, ellipsis when long (matches seed rows). */
export function formatHookCopy(hook: string | null | undefined, layout: NamerSheetLayout): string {
  if (!hook?.trim()) return ""
  const text = hook.trim().replace(/\s+/g, " ")
  if (layout === "creative_builder") return hookPreview(text)
  if (text.length <= 42) return text
  return `${text.slice(0, 39).trimEnd()}…`
}

export function normalizeNamerGcsPath(gcsPath: string | null | undefined): string {
  if (!gcsPath?.trim()) return ""
  const trimmed = gcsPath.trim()

  if (trimmed.startsWith("https://storage.googleapis.com/")) {
    try {
      const url = new URL(trimmed.split("?")[0] ?? trimmed)
      const parts = url.pathname.split("/").filter(Boolean)
      if (parts.length >= 2) {
        const [bucket, ...objectParts] = parts
        return `gs://${bucket}/${objectParts.map((p) => decodeURIComponent(p)).join("/")}`
      }
    } catch {
      return trimmed.split("?")[0] ?? trimmed
    }
  }

  if (trimmed.startsWith("gs://")) return trimmed.split("?")[0] ?? trimmed
  return trimmed
}

export function normalizeTestId(testId: string): string {
  const match = /^T(\d+)$/i.exec(testId.trim())
  if (!match) return testId.trim()
  return `T${match[1].padStart(2, "0")}`
}

function extendedHeadersForLayout(layout: NamerSheetLayout, headers: string[]): readonly string[] {
  const hasGcsPath = colIndex(headers, [/^gcs path$/i]) >= 0
  if (layout === "ad_builder") {
    return [...new Set([...AD_BUILDER_ENSURE_COLUMNS, ...NAMER_EXTENDED_HEADERS_AD_BUILDER])]
  }
  if (hasGcsPath) return NAMER_EXTENDED_HEADERS_AD_BUILDER
  return NAMER_EXTENDED_HEADERS_WITH_LINK
}

export function sizeFromFormatToken(formatToken: string, aspectRatio: string): string {
  const staticMatch = /^Static_(\d+x\d+)$/i.exec(formatToken)
  if (staticMatch) return staticMatch[1]
  if (aspectRatio && aspectRatio !== "NA") return aspectRatio.replace(":", "x")
  return "NA"
}

export function videoLengthDisplay(formatType: string, length: string): string {
  if (formatType === "Video") return length === "NA" ? "" : length
  return "NA"
}

function headlineFromBrief(brief: BriefRow): string {
  if (brief.copy_headline?.trim()) return brief.copy_headline.trim()

  const td = brief.trigger_data ?? {}
  const svgTokens = td.svg_tokens
  if (svgTokens && typeof svgTokens === "object") {
    const headline = (svgTokens as Record<string, unknown>).HEADLINE
    if (typeof headline === "string" && headline.trim()) return headline.trim()
  }

  const svgVars = td.svg_variations
  if (Array.isArray(svgVars) && svgVars.length) {
    const first = svgVars[0]
    if (first && typeof first === "object") {
      const tokens = (first as Record<string, unknown>).tokens
      if (tokens && typeof tokens === "object") {
        const headline = (tokens as Record<string, unknown>).HEADLINE
        if (typeof headline === "string" && headline.trim()) return headline.trim()
      }
    }
  }

  const staticVars = td.static_variations
  if (Array.isArray(staticVars) && staticVars.length) {
    const first = staticVars[0]
    if (first && typeof first === "object") {
      const headline = (first as Record<string, unknown>).headline
      if (typeof headline === "string" && headline.trim()) return headline.trim()
    }
  }

  return brief.hook?.trim() ?? ""
}

/** Hook Copy column — prefers brief headline, same ellipsis styling as before. */
export function hookCopyFromBrief(brief: BriefRow, layout: NamerSheetLayout): string {
  return formatHookCopy(headlineFromBrief(brief), layout)
}

export function briefInputProvenance(brief: BriefRow): ProvenanceLabel {
  const createdBy = brief.created_by?.trim().toLowerCase() ?? ""
  const triggerType = brief.trigger_type?.trim().toLowerCase() ?? ""
  if (
    createdBy === "agent" ||
    createdBy === "evaluator" ||
    createdBy === "creative_agent" ||
    triggerType === "agent" ||
    triggerType === "recommendation"
  ) {
    return "Bot"
  }
  return "Human"
}

export function agentManagedProvenance(agentManaged: boolean | null | undefined): ProvenanceLabel {
  if (agentManaged === true) return "Bot"
  if (agentManaged === false) return "Human"
  return "Pending"
}

export function pipelineTemplateFromBrief(brief: BriefRow): string {
  const td = brief.trigger_data ?? {}
  const templateId = typeof td.template_id === "string" ? td.template_id.trim() : ""
  return templateId || "—"
}

/** Resolve Meta campaign / ad set / ad IDs for namer sheet columns (registry, then Graph API). */
export async function resolveMetaPlatformIds(
  admin: SupabaseClient,
  asset: Pick<AssetRow, "meta_ad_id" | "meta_adset_id">
): Promise<MetaPlatformIds> {
  let adId = asset.meta_ad_id?.trim() ?? ""
  let adSetId = asset.meta_adset_id?.trim() ?? ""
  let campaignId = ""

  if (adSetId) {
    try {
      const { data: adset } = await admin
        .from("adset_registry")
        .select("campaign_registry_id, platform_campaign_id")
        .eq("platform_id", adSetId)
        .maybeSingle()

      const fromAdset =
        typeof adset?.platform_campaign_id === "string" ? adset.platform_campaign_id.trim() : ""
      if (fromAdset) campaignId = fromAdset

      const campaignRegistryId =
        typeof adset?.campaign_registry_id === "string" ? adset.campaign_registry_id : null
      if (!campaignId && campaignRegistryId) {
        const { data: campaign } = await admin
          .from("campaign_registry")
          .select("platform_campaign_id")
          .eq("id", campaignRegistryId)
          .maybeSingle()
        const fromRegistry =
          typeof campaign?.platform_campaign_id === "string"
            ? campaign.platform_campaign_id.trim()
            : ""
        if (fromRegistry) campaignId = fromRegistry
      }
    } catch {
      // Registry tables may be absent in some environments.
    }

    if (!campaignId) {
      const metaRes = await fetchMetaAdSet(adSetId)
      if (metaRes.ok && metaRes.data?.campaign_id) {
        campaignId = metaRes.data.campaign_id.trim()
      }
    }
  }

  if (adId && (!adSetId || !campaignId)) {
    const metaRes = await fetchMetaAd(adId)
    if (metaRes.ok && metaRes.data) {
      if (!adSetId && metaRes.data.adset_id) adSetId = metaRes.data.adset_id.trim()
      if (!campaignId && metaRes.data.campaign_id) {
        campaignId = metaRes.data.campaign_id.trim()
      }
    }
  }

  return { adId, adSetId, campaignId }
}

export function buildNamerCreativeRow(
  asset: AssetRow,
  brief: BriefRow,
  provenance: { campaignGen: ProvenanceLabel; adSetGen: ProvenanceLabel },
  links: { gcsPath: string; signedUrl: string },
  layout: NamerSheetLayout = "creative_builder",
  thrmlIds?: { campaignId: string; adSetId: string; adId: string }
): NamerCreativeRow | null {
  const conventionName = asset.convention_name?.trim()
  if (!conventionName) return null

  const tokens = parseAdName(conventionName)
  if (!tokens) return null

  const [formatType, length, aspectRatio] = splitFormatToken(tokens.format)
  const sizeToken = sizeFromFormatToken(tokens.format, aspectRatio)
  const videoLength = videoLengthDisplay(formatType, length)
  const status = layout === "ad_builder" ? "TEST" : "Draft"
  const gcsPath = normalizeNamerGcsPath(links.gcsPath)

  return {
    adId: thrmlIds?.adId?.trim() ?? "",
    adSetId: thrmlIds?.adSetId?.trim() ?? "",
    campaignId: thrmlIds?.campaignId?.trim() ?? "",
    testId: normalizeTestId(tokens.testId),
    variant: tokens.variant.toUpperCase().slice(0, 1),
    angle: tokens.angle,
    formatToken: tokens.format,
    formatType,
    sizeToken,
    length,
    videoLength,
    aspectRatio,
    cta: tokens.cta,
    adName: conventionName,
    hookPreview: hookCopyFromBrief(brief, layout),
    status,
    platform: "",
    phase: "",
    optEvent: "",
    assetGcsPath: gcsPath,
    assetGcsLink: links.signedUrl,
    pipelineTemplate: pipelineTemplateFromBrief(brief),
    assetUuid: asset.id,
    briefInput: briefInputProvenance(brief),
    creativeGen: "Bot",
    campaignGen: provenance.campaignGen,
    adSetGen: provenance.adSetGen,
  }
}

export function namerRowToSheetValues(row: NamerCreativeRow): string[] {
  return [
    row.adId,
    row.adSetId,
    row.campaignId,
    row.testId,
    row.variant,
    row.angle,
    row.formatType,
    row.length,
    row.aspectRatio,
    row.cta,
    row.adName,
    row.hookPreview,
    row.status,
    row.platform,
    row.phase,
    row.optEvent,
    row.assetGcsLink,
    row.pipelineTemplate,
    row.assetUuid,
    row.briefInput,
    row.creativeGen,
    row.campaignGen,
    row.adSetGen,
  ]
}

export function findCreativeBuilderHeader(
  rows: string[][]
): { headerRow: number; headers: string[]; layout: NamerSheetLayout } | null {
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const line = rows[r] ?? []
    const normalized = line.map((c) => String(c).trim())
    const joined = normalized.join(" ").toLowerCase()

    // thrml_namer_v4 — Ad Builder tab (TEST / VAR / FORMAT / GCS Path)
    if (
      normalized.some((h) => /^test$/i.test(h)) &&
      normalized.some((h) => /^var$/i.test(h)) &&
      normalized.some((h) => /^format$/i.test(h)) &&
      normalized.some((h) => /ad name/i.test(h))
    ) {
      return { headerRow: r, headers: normalized, layout: "ad_builder" }
    }

    if (
      normalized.some((h) => /^test id$/i.test(h)) &&
      normalized.some((h) => /ad name/i.test(h) || h.startsWith("→"))
    ) {
      return { headerRow: r, headers: normalized, layout: "creative_builder" }
    }

    if (
      normalized.some((h) => /^format type$/i.test(h)) &&
      normalized.some((h) => /ad name/i.test(h) || h.startsWith("→"))
    ) {
      return { headerRow: r, headers: normalized, layout: "creative_builder" }
    }

    if (
      normalized.some((h) => /^concept$/i.test(h)) &&
      normalized.some((h) => /ad name/i.test(h) || h.startsWith("→"))
    ) {
      return { headerRow: r, headers: normalized, layout: "legacy" }
    }

    if (joined.includes("test id") && joined.includes("cta") && joined.includes("ad name")) {
      return { headerRow: r, headers: normalized, layout: "creative_builder" }
    }

    if (joined.includes("concept") && joined.includes("cta") && joined.includes("ad name")) {
      return { headerRow: r, headers: normalized, layout: "legacy" }
    }
  }
  return null
}

function colIndex(headers: string[], patterns: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i] ?? ""
    if (patterns.some((p) => p.test(h))) return i
  }
  return -1
}

function headerPatternsForExtended(label: string): RegExp[] {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return [new RegExp(`^${escaped}$`, "i")]
}

function rowHasAssetUuid(row: string[], headers: string[], assetId: string): boolean {
  const uuidCol = colIndex(headers, headerPatternsForExtended("Asset UUID"))
  if (uuidCol < 0) return false
  return (row[uuidCol] ?? "").trim() === assetId
}

function rowHasConventionName(row: string[], headers: string[], conventionName: string): boolean {
  const adNameCol = colIndex(headers, [/→?\s*ad name/i, /^ad name/i])
  if (adNameCol < 0) return false
  return (row[adNameCol] ?? "").trim() === conventionName
}

async function resolveRegistryProvenance(
  admin: SupabaseClient,
  asset: AssetRow,
  conventionName: string
): Promise<{ campaignGen: ProvenanceLabel; adSetGen: ProvenanceLabel }> {
  let campaignGen: ProvenanceLabel = "Pending"
  let adSetGen: ProvenanceLabel = "Pending"

  const lookupCreative = async () => {
    if (asset.meta_ad_id?.trim()) {
      const { data } = await admin
        .from("creative_registry")
        .select("agent_managed, adset_registry_id")
        .eq("platform_id", asset.meta_ad_id.trim())
        .maybeSingle()
      return data
    }
    const { data } = await admin
      .from("creative_registry")
      .select("agent_managed, adset_registry_id")
      .eq("creative_name", conventionName)
      .maybeSingle()
    return data
  }

  try {
    const creative = await lookupCreative()
    if (!creative) return { campaignGen, adSetGen }

    if (typeof creative.agent_managed === "boolean") {
      // Ad-level registry row exists; creative pipeline output is still bot-generated.
    }

    const adsetRegistryId =
      typeof creative.adset_registry_id === "string" ? creative.adset_registry_id : null
    if (adsetRegistryId) {
      const { data: adset } = await admin
        .from("adset_registry")
        .select("agent_managed, campaign_registry_id")
        .eq("id", adsetRegistryId)
        .maybeSingle()

      if (adset) {
        adSetGen = agentManagedProvenance(adset.agent_managed as boolean | null | undefined)
        const campaignRegistryId =
          typeof adset.campaign_registry_id === "string" ? adset.campaign_registry_id : null
        if (campaignRegistryId) {
          const { data: campaign } = await admin
            .from("campaign_registry")
            .select("agent_managed")
            .eq("id", campaignRegistryId)
            .maybeSingle()
          if (campaign) {
            campaignGen = agentManagedProvenance(campaign.agent_managed as boolean | null | undefined)
          }
        }
      }
    } else if (asset.meta_adset_id?.trim()) {
      const { data: adset } = await admin
        .from("adset_registry")
        .select("agent_managed, campaign_registry_id")
        .eq("platform_id", asset.meta_adset_id.trim())
        .maybeSingle()
      if (adset) {
        adSetGen = agentManagedProvenance(adset.agent_managed as boolean | null | undefined)
        const campaignRegistryId =
          typeof adset.campaign_registry_id === "string" ? adset.campaign_registry_id : null
        if (campaignRegistryId) {
          const { data: campaign } = await admin
            .from("campaign_registry")
            .select("agent_managed")
            .eq("id", campaignRegistryId)
            .maybeSingle()
          if (campaign) {
            campaignGen = agentManagedProvenance(campaign.agent_managed as boolean | null | undefined)
          }
        }
      }
    }
  } catch {
    // Registry tables may be absent in some environments — keep Pending.
  }

  return { campaignGen, adSetGen }
}

async function resolveAssetGcsLink(asset: AssetRow): Promise<string> {
  if (asset.gcs_path?.trim()) {
    try {
      return await refreshCreativeAssetUrl(asset.gcs_path.trim())
    } catch {
      return asset.gcs_path.trim()
    }
  }
  if (asset.gcs_url?.trim()) return asset.gcs_url.trim()
  return ""
}

async function ensureExtendedHeaders(
  sheets: ReturnType<typeof createGoogleSheetsClient>,
  spreadsheetId: string,
  tabTitle: string,
  headerRow1Based: number,
  headers: string[],
  layout: NamerSheetLayout
): Promise<string[]> {
  const desired = extendedHeadersForLayout(layout, headers)
  const missing = desired.filter((label) => colIndex(headers, headerPatternsForExtended(label)) < 0)
  if (!missing.length) return headers

  const nextHeaders = [...headers]
  for (const label of missing) {
    nextHeaders.push(label)
  }

  const escaped = tabTitle.replace(/'/g, "''")
  const endCol = columnToLetter(nextHeaders.length - 1)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${escaped}'!A${headerRow1Based}:${endCol}${headerRow1Based}`,
    valueInputOption: "RAW",
    requestBody: { values: [nextHeaders] },
  })

  return nextHeaders
}

async function ensureAdBuilderFormatColumns(
  sheets: ReturnType<typeof createGoogleSheetsClient>,
  spreadsheetId: string,
  tabTitle: string,
  headerRow0Based: number,
  headers: string[]
): Promise<string[]> {
  const hasSize = colIndex(headers, [/^size$/i]) >= 0
  const hasVideoLength = colIndex(headers, [/^video length$/i]) >= 0
  if (hasSize && hasVideoLength) return headers

  const formatCol = colIndex(headers, [/^format$/i])
  if (formatCol < 0) return headers

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" })
  const sheetId = meta.data.sheets?.find((s) => s.properties?.title === tabTitle)?.properties?.sheetId
  if (sheetId == null) return headers

  const labelsToInsert: string[] = []
  if (!hasSize) labelsToInsert.push("Size")
  if (!hasVideoLength) labelsToInsert.push("Video Length")
  if (!labelsToInsert.length) return headers

  const insertAt = formatCol + 1
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          insertDimension: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: insertAt,
              endIndex: insertAt + labelsToInsert.length,
            },
            inheritFromBefore: false,
          },
        },
      ],
    },
  })

  const escaped = tabTitle.replace(/'/g, "''")
  const headerRow1 = headerRow0Based + 1
  await batchWriteCells(
    sheets,
    spreadsheetId,
    labelsToInsert.map((label, i) => ({
      range: `'${escaped}'!${columnToLetter(insertAt + i)}${headerRow1}`,
      values: [[label]],
    }))
  )

  const next = [...headers]
  next.splice(insertAt, 0, ...labelsToInsert)
  return next
}

async function prepareSheetHeaders(
  sheets: ReturnType<typeof createGoogleSheetsClient>,
  spreadsheetId: string,
  tabTitle: string,
  headerInfo: { headerRow: number; headers: string[]; layout: NamerSheetLayout }
): Promise<string[]> {
  let headers = headerInfo.headers
  if (headerInfo.layout === "ad_builder") {
    headers = await ensureAdBuilderFormatColumns(
      sheets,
      spreadsheetId,
      tabTitle,
      headerInfo.headerRow,
      headers
    )
  }
  return ensureExtendedHeaders(
    sheets,
    spreadsheetId,
    tabTitle,
    headerInfo.headerRow + 1,
    headers,
    headerInfo.layout
  )
}

async function loadPreparedSheetTab(
  sheets: ReturnType<typeof createGoogleSheetsClient>,
  spreadsheetId: string,
  tabTitle: string
): Promise<{
  rows: string[][]
  headerInfo: { headerRow: number; headers: string[]; layout: NamerSheetLayout }
  headers: string[]
} | null> {
  const initialRows = await readSheetValues(sheets, spreadsheetId, tabTitle)
  const headerInfo = findCreativeBuilderHeader(initialRows)
  if (!headerInfo) return null

  await prepareSheetHeaders(sheets, spreadsheetId, tabTitle, headerInfo)

  const rows = await readSheetValues(sheets, spreadsheetId, tabTitle)
  const refreshedHeader = findCreativeBuilderHeader(rows)
  if (!refreshedHeader) return null

  return {
    rows,
    headerInfo: refreshedHeader,
    headers: refreshedHeader.headers,
  }
}

function mapRowToHeaderColumns(
  headers: string[],
  row: NamerCreativeRow,
  layout: NamerSheetLayout,
  platformIds?: MetaPlatformIds
): string[] {
  const values = new Array(headers.length).fill("")
  const set = (patterns: RegExp[], value: string) => {
    const idx = colIndex(headers, patterns)
    if (idx >= 0) values[idx] = value
  }

  set(HEADER_PATTERNS.thrmlAdId, row.adId)
  set(HEADER_PATTERNS.thrmlAdSetId, row.adSetId)
  set(HEADER_PATTERNS.thrmlCampaignId, row.campaignId)
  if (platformIds) {
    set(HEADER_PATTERNS.platformCampaignId, platformIds.campaignId)
    set(HEADER_PATTERNS.platformAdSetId, platformIds.adSetId)
    set(HEADER_PATTERNS.platformAdId, platformIds.adId)
  }

  if (layout === "ad_builder") {
    set([/^test$/i, /^test id$/i], row.testId)
    set([/^var$/i, /^variant$/i], row.variant)
    set([/^angle$/i], row.angle)
    set([/^format$/i], row.formatType)
    set([/^size$/i], row.sizeToken)
    set([/^video length$/i], row.videoLength)
    set([/^gcs path$/i], row.assetGcsPath)
  } else if (layout === "creative_builder") {
    set([/^test id$/i], row.testId)
    set([/^variant$/i], row.variant)
    set([/^angle$/i], row.angle)
    set([/^format type$/i], row.formatType)
    set([/^length$/i], row.length)
    set([/^aspect ratio$/i], row.aspectRatio)
  } else {
    set([/^concept$/i], row.angle)
    set([/^format$/i], row.formatType.toLowerCase())
    set([/^length$/i], row.length)
    set([/^size$/i], row.aspectRatio.replace(":", "x"))
    set([/^variant$/i], row.variant)
  }

  set([/^cta$/i], row.cta)
  set([/→?\s*ad name/i, /^ad name/i], row.adName)
  set([/^hook copy/i, /^hook$/i], row.hookPreview)
  set([/^status$/i], row.status)
  set([/^platform$/i], row.platform)
  set([/^phase$/i], row.phase)
  set([/^opt\.?\s*event$/i, /^conv\.?\s*event$/i], row.optEvent)

  const hasGcsPath = colIndex(headers, [/^gcs path$/i]) >= 0
  if (!hasGcsPath) {
    set(headerPatternsForExtended("Asset GCS Link"), row.assetGcsPath || row.assetGcsLink)
  } else {
    const linkCol = colIndex(headers, headerPatternsForExtended("Asset GCS Link"))
    if (linkCol >= 0) values[linkCol] = ""
  }

  set(headerPatternsForExtended("Pipeline Template"), row.pipelineTemplate)
  set(headerPatternsForExtended("Asset UUID"), row.assetUuid)
  set(headerPatternsForExtended("Brief Input"), row.briefInput)
  set(headerPatternsForExtended("Creative Gen"), row.creativeGen)
  set(headerPatternsForExtended("Campaign Gen"), row.campaignGen)
  set(headerPatternsForExtended("Ad Set Gen"), row.adSetGen)

  return values
}

function sheetsErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 403) {
    return (
      "Google Sheets permission denied — share thrml_namer_v4 with " +
      "thrml-agent@watchful-muse-350902.iam.gserviceaccount.com as Editor"
    )
  }
  if (err instanceof Error) return err.message
  return String(err)
}

async function saveNamerExportToGcs(assetId: string, payload: Record<string, unknown>) {
  const objectPath = `namer/exports/${assetId}.json`
  const body = Buffer.from(JSON.stringify(payload, null, 2), "utf8")
  const uploaded = await uploadBufferToCreativeObject(objectPath, body, "application/json")
  return uploaded.gcsPath
}

/** Cell-level writes for platform ID columns on an existing Ad Builder row. */
export function buildPlatformIdSheetUpdates(
  headers: string[],
  sheetRow0Based: number,
  tabTitle: string,
  ids: MetaPlatformIds,
  layout: NamerSheetLayout
): { range: string; values: string[][] }[] {
  const hasAny = Boolean(ids.adId || ids.adSetId || ids.campaignId)
  if (!hasAny) return []

  const escapedTab = tabTitle.replace(/'/g, "''")
  const row1 = sheetRow0Based + 1
  const updates: { range: string; values: string[][] }[] = []
  const add = (patterns: RegExp[], value: string) => {
    const v = value.trim()
    if (!v) return
    const idx = colIndex(headers, patterns)
    if (idx < 0) return
    updates.push({
      range: `'${escapedTab}'!${columnToLetter(idx)}${row1}`,
      values: [[v]],
    })
  }

  add(HEADER_PATTERNS.platformCampaignId, ids.campaignId)
  add(HEADER_PATTERNS.platformAdSetId, ids.adSetId)
  add(HEADER_PATTERNS.platformAdId, ids.adId)

  return updates
}

export function buildThrmlIdSheetUpdates(
  headers: string[],
  sheetRow0Based: number,
  tabTitle: string,
  ids: { campaignId: string; adSetId: string; adId: string }
): { range: string; values: string[][] }[] {
  const escapedTab = tabTitle.replace(/'/g, "''")
  const row1 = sheetRow0Based + 1
  const updates: { range: string; values: string[][] }[] = []
  const add = (patterns: RegExp[], value: string) => {
    const v = value.trim()
    if (!v) return
    const idx = colIndex(headers, patterns)
    if (idx < 0) return
    updates.push({
      range: `'${escapedTab}'!${columnToLetter(idx)}${row1}`,
      values: [[v]],
    })
  }

  add(HEADER_PATTERNS.thrmlCampaignId, ids.campaignId)
  add(HEADER_PATTERNS.thrmlAdSetId, ids.adSetId)
  add(HEADER_PATTERNS.thrmlAdId, ids.adId)

  return updates
}

function collectColumnValues(rows: string[][], headers: string[], patterns: RegExp[]): string[] {
  const col = colIndex(headers, patterns)
  if (col < 0) return []
  const values: string[] = []
  for (const row of rows) {
    const v = (row[col] ?? "").trim()
    if (v) values.push(v)
  }
  return values
}

/**
 * After Meta launch, patch Ad Builder rows with platform campaign / ad set / ad IDs.
 * Best-effort: does not throw; callers should not fail launch on sheet errors.
 */
export async function syncNamerPlatformIdsForAssets(
  admin: SupabaseClient,
  assetIds: string[]
): Promise<NamerPlatformSyncResult> {
  const uniqueIds = [...new Set(assetIds.map((id) => id.trim()).filter(Boolean))]
  if (!uniqueIds.length) {
    return { ok: true, updated: 0, skipped: 0, errors: [] }
  }

  const sheetId = await resolveNamerSheetId(admin)
  if (!sheetId) {
    return { ok: true, updated: 0, skipped: uniqueIds.length, errors: [] }
  }

  const sheets = createGoogleSheetsClient()
  let tabTitle: string
  let sheetState: NonNullable<Awaited<ReturnType<typeof loadPreparedSheetTab>>>

  try {
    const tabTitles = await listSpreadsheetTabs(sheets, sheetId)
    const resolvedTab = resolveTabTitle(tabTitles, ...CREATIVE_BUILDER_TAB_CANDIDATES)
    if (!resolvedTab) {
      return {
        ok: false,
        updated: 0,
        skipped: 0,
        errors: [{ assetId: uniqueIds[0]!, reason: "Ad Builder tab not found" }],
      }
    }
    tabTitle = resolvedTab
    const prepared = await loadPreparedSheetTab(sheets, sheetId, tabTitle)
    if (!prepared) {
      return {
        ok: false,
        updated: 0,
        skipped: 0,
        errors: [{ assetId: uniqueIds[0]!, reason: "Ad Builder header row not found" }],
      }
    }
    sheetState = prepared
  } catch (err) {
    return {
      ok: false,
      updated: 0,
      skipped: 0,
      errors: [
        {
          assetId: uniqueIds[0]!,
          reason: sheetsErrorMessage(err),
        },
      ],
    }
  }

  const { rows: existingRows, headerInfo, headers } = sheetState
  const errors: { assetId: string; reason: string }[] = []
  let updated = 0
  let skipped = 0
  const cellUpdates: { range: string; values: string[][] }[] = []

  for (const assetId of uniqueIds) {
    const { data: asset, error: assetError } = await admin
      .from("creative_assets")
      .select(
        "id, brief_id, convention_name, gcs_path, gcs_url, format, meta_ad_id, meta_adset_id, namer_synced_at"
      )
      .eq("id", assetId)
      .maybeSingle()

    if (assetError || !asset) {
      errors.push({ assetId, reason: assetError?.message ?? "Asset not found" })
      continue
    }

    const platformIds = await resolveMetaPlatformIds(admin, asset as AssetRow)
    if (!platformIds.adId && !platformIds.adSetId) {
      skipped++
      errors.push({ assetId, reason: "No meta_ad_id or meta_adset_id on asset" })
      continue
    }

    let conventionName = asset.convention_name?.trim() ?? ""
    if (!asset.namer_synced_at) {
      const appendResult = await appendApprovedCreativeToNamer(admin, assetId)
      if (!appendResult.ok) {
        errors.push({
          assetId,
          reason: appendResult.reason ?? "Could not append row before platform ID sync",
        })
        continue
      }
      const { data: refreshed } = await admin
        .from("creative_assets")
        .select("convention_name, namer_synced_at")
        .eq("id", assetId)
        .maybeSingle()
      conventionName = refreshed?.convention_name?.trim() ?? conventionName
    }

    if (!conventionName) {
      skipped++
      errors.push({ assetId, reason: "Missing convention_name" })
      continue
    }

    const sheetRow = findSheetRowForAsset(
      existingRows,
      { headerRow: headerInfo.headerRow, headers },
      assetId,
      conventionName
    )
    if (sheetRow < 0) {
      errors.push({ assetId, reason: "Row not found in Ad Builder sheet" })
      continue
    }

    const thrmlIds = await resolveThrmlLegacyIdsFromPlatform(admin, platformIds)
    const rowUpdates = [
      ...buildPlatformIdSheetUpdates(headers, sheetRow, tabTitle, platformIds, headerInfo.layout),
      ...buildThrmlIdSheetUpdates(headers, sheetRow, tabTitle, thrmlIds),
    ]
    if (!rowUpdates.length) {
      skipped++
      errors.push({ assetId, reason: "Sheet has no platform or Thrml ID columns" })
      continue
    }

    cellUpdates.push(...rowUpdates)
    updated++
  }

  if (cellUpdates.length) {
    try {
      await batchWriteCells(sheets, sheetId, cellUpdates)
    } catch (err) {
      return {
        ok: false,
        updated: 0,
        skipped,
        errors: [
          ...errors,
          { assetId: uniqueIds[0]!, reason: sheetsErrorMessage(err) },
        ],
      }
    }
  }

  return {
    ok: errors.length === 0,
    updated,
    skipped,
    errors,
  }
}

export async function appendApprovedCreativeToNamer(
  admin: SupabaseClient,
  assetId: string
): Promise<NamerCreativeAppendResult> {
  const sheetId = await resolveNamerSheetId(admin)
  if (!sheetId) {
    return { ok: true, skipped: true, reason: "NAMER_SHEET_ID not configured" }
  }

  const { data: asset, error: assetError } = await admin
    .from("creative_assets")
    .select(
      "id, brief_id, convention_name, gcs_path, gcs_url, format, meta_ad_id, meta_adset_id, namer_synced_at"
    )
    .eq("id", assetId)
    .maybeSingle()

  if (assetError) return { ok: false, reason: assetError.message }
  if (!asset) return { ok: false, reason: "Asset not found" }
  if (asset.namer_synced_at) {
    return { ok: true, skipped: true, reason: "Already synced to namer" }
  }

  if (!asset.convention_name?.trim()) {
    return { ok: true, skipped: true, reason: "Asset has no convention_name" }
  }

  const { data: brief, error: briefError } = await admin
    .from("creative_briefs")
    .select("id, trigger_type, trigger_data, created_by, hook, copy_headline")
    .eq("id", asset.brief_id)
    .maybeSingle()

  if (briefError) return { ok: false, reason: briefError.message }
  if (!brief) return { ok: false, reason: "Brief not found for asset" }

  const conventionName = asset.convention_name.trim()
  const assetGcsPath = normalizeNamerGcsPath((asset as AssetRow).gcs_path)
  const signedUrl = await resolveAssetGcsLink(asset as AssetRow)
  const provenance = await resolveRegistryProvenance(admin, asset as AssetRow, conventionName)
  const platformIds = await resolveMetaPlatformIds(admin, asset as AssetRow)

  const sheets = createGoogleSheetsClient()
  let tabTitle: string
  let sheetState: NonNullable<Awaited<ReturnType<typeof loadPreparedSheetTab>>>

  try {
    const tabTitles = await listSpreadsheetTabs(sheets, sheetId)
    const resolvedTab = resolveTabTitle(tabTitles, ...CREATIVE_BUILDER_TAB_CANDIDATES)
    if (!resolvedTab) {
      return { ok: false, reason: "Creative Builder tab not found in namer sheet" }
    }
    tabTitle = resolvedTab

    const prepared = await loadPreparedSheetTab(sheets, sheetId, tabTitle)
    if (!prepared) {
      return { ok: false, reason: "Creative Builder header row not found" }
    }
    sheetState = prepared
  } catch (err) {
    return { ok: false, reason: sheetsErrorMessage(err) }
  }

  const { rows: existingRows, headerInfo, headers } = sheetState
  const dataRows = existingRows.slice(headerInfo.headerRow + 1)
  const existingThrmlAdIds = collectColumnValues(dataRows, headers, HEADER_PATTERNS.thrmlAdId)
  const thrmlIds = await resolveThrmlLegacyIdsFromPlatform(admin, platformIds)
  if (!thrmlIds.adId) {
    thrmlIds.adId = allocateNextThrmlLegacyId(existingThrmlAdIds, "ad")
  }

  const row = buildNamerCreativeRow(
    asset as AssetRow,
    brief as BriefRow,
    provenance,
    { gcsPath: assetGcsPath, signedUrl },
    headerInfo.layout,
    thrmlIds
  )
  if (!row) {
    return { ok: true, skipped: true, reason: "Could not parse convention_name for namer row" }
  }

  const patchIdCells = (sheetRow: number) => [
    ...buildPlatformIdSheetUpdates(headers, sheetRow, tabTitle, platformIds, headerInfo.layout),
    ...buildThrmlIdSheetUpdates(headers, sheetRow, tabTitle, thrmlIds),
  ]

  for (let r = headerInfo.headerRow + 1; r < existingRows.length; r++) {
    const line = existingRows[r] ?? []
    if (rowHasAssetUuid(line, headers, assetId)) {
      const sheetRow = r
      const idUpdates = patchIdCells(sheetRow)
      if (idUpdates.length) {
        try {
          await batchWriteCells(sheets, sheetId, idUpdates)
        } catch (err) {
          return { ok: false, reason: sheetsErrorMessage(err) }
        }
      }
      await admin
        .from("creative_assets")
        .update({ namer_synced_at: new Date().toISOString() })
        .eq("id", assetId)
      return {
        ok: true,
        skipped: true,
        reason: idUpdates.length
          ? "Row already present; platform IDs refreshed"
          : "Row already present in sheet (Asset UUID)",
      }
    }
    if (rowHasConventionName(line, headers, conventionName)) {
      const sheetRow = r
      const idUpdates = patchIdCells(sheetRow)
      if (idUpdates.length) {
        try {
          await batchWriteCells(sheets, sheetId, idUpdates)
        } catch (err) {
          return { ok: false, reason: sheetsErrorMessage(err) }
        }
      }
      await admin
        .from("creative_assets")
        .update({ namer_synced_at: new Date().toISOString() })
        .eq("id", assetId)
      return {
        ok: true,
        skipped: true,
        reason: idUpdates.length
          ? "Row already present; platform IDs refreshed"
          : "Row already present in sheet (Ad Name)",
      }
    }
  }

  const sheetValues = mapRowToHeaderColumns(headers, row, headerInfo.layout)
  const endCol = columnToLetter(Math.max(headers.length - 1, 0))
  const escapedTab = tabTitle.replace(/'/g, "''")

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `'${escapedTab}'!A:${endCol}`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [sheetValues] },
    })
  } catch (err) {
    return { ok: false, reason: sheetsErrorMessage(err) }
  }

  const exportPayload = {
    version: 1,
    synced_at: new Date().toISOString(),
    sheet_id: sheetId,
    tab: tabTitle,
    row,
    sheet_values: sheetValues,
  }

  let gcsExportPath: string | undefined
  try {
    gcsExportPath = await saveNamerExportToGcs(assetId, exportPayload)
  } catch (err) {
    console.error("[namer-creative-append] GCS export failed:", err)
  }

  const now = new Date().toISOString()
  await admin
    .from("creative_assets")
    .update({
      namer_synced_at: now,
      ...(gcsExportPath ? { namer_export_gcs_path: gcsExportPath } : {}),
    })
    .eq("id", assetId)

  return {
    ok: true,
    tabTitle,
    gcsExportPath,
    assetGcsLink: row.assetGcsPath || signedUrl || undefined,
  }
}

async function loadAssetAndBrief(admin: SupabaseClient, assetId: string) {
  const { data: asset, error: assetError } = await admin
    .from("creative_assets")
    .select(
      "id, brief_id, convention_name, gcs_path, gcs_url, format, meta_ad_id, meta_adset_id, namer_synced_at"
    )
    .eq("id", assetId)
    .maybeSingle()

  if (assetError || !asset?.convention_name?.trim()) return null

  const { data: brief, error: briefError } = await admin
    .from("creative_briefs")
    .select("id, trigger_type, trigger_data, created_by, hook, copy_headline")
    .eq("id", asset.brief_id)
    .maybeSingle()

  if (briefError || !brief) return null
  return { asset: asset as AssetRow, brief: brief as BriefRow }
}

function findSheetRowForAsset(
  rows: string[][],
  headerInfo: { headerRow: number; headers: string[] },
  assetId: string,
  conventionName: string
): number {
  for (let r = headerInfo.headerRow + 1; r < rows.length; r++) {
    const line = rows[r] ?? []
    if (rowHasAssetUuid(line, headerInfo.headers, assetId)) return r
    if (rowHasConventionName(line, headerInfo.headers, conventionName)) return r
  }
  return -1
}

/** Rewrite pipeline rows already in the namer sheet (formatting fixes). */
export async function repairSyncedNamerRows(
  admin: SupabaseClient
): Promise<{ repaired: number; errors: string[] }> {
  const sheetId = await resolveNamerSheetId(admin)
  if (!sheetId) return { repaired: 0, errors: ["NAMER_SHEET_ID not configured"] }

  const { data: assets, error } = await admin
    .from("creative_assets")
    .select("id")
    .not("namer_synced_at", "is", null)
    .not("convention_name", "is", null)

  if (error) return { repaired: 0, errors: [error.message] }
  if (!assets?.length) return { repaired: 0, errors: [] }

  const sheets = createGoogleSheetsClient()
  const tabTitles = await listSpreadsheetTabs(sheets, sheetId)
  const tabTitleResolved = resolveTabTitle(tabTitles, ...CREATIVE_BUILDER_TAB_CANDIDATES)
  if (!tabTitleResolved) return { repaired: 0, errors: ["Ad Builder tab not found"] }

  let sheetState: NonNullable<Awaited<ReturnType<typeof loadPreparedSheetTab>>>
  try {
    const prepared = await loadPreparedSheetTab(sheets, sheetId, tabTitleResolved)
    if (!prepared) return { repaired: 0, errors: ["Header row not found"] }
    sheetState = prepared
  } catch (err) {
    return { repaired: 0, errors: [sheetsErrorMessage(err)] }
  }

  const { rows: existingRows, headerInfo, headers } = sheetState
  const tabTitle = tabTitleResolved

  const errors: string[] = []
  let repaired = 0
  const updates: { range: string; values: string[][] }[] = []

  for (const { id: assetId } of assets) {
    const loaded = await loadAssetAndBrief(admin, assetId)
    if (!loaded) {
      errors.push(`${assetId}: asset/brief not found`)
      continue
    }

    const conventionName = loaded.asset.convention_name!.trim()
    const sheetRow = findSheetRowForAsset(existingRows, { headerRow: headerInfo.headerRow, headers }, assetId, conventionName)
    if (sheetRow < 0) {
      errors.push(`${assetId}: row not found in sheet`)
      continue
    }

    const signedUrl = await resolveAssetGcsLink(loaded.asset)
    const provenance = await resolveRegistryProvenance(admin, loaded.asset, conventionName)
    const platformIds = await resolveMetaPlatformIds(admin, loaded.asset)
    const thrmlIds = await resolveThrmlLegacyIdsFromPlatform(admin, platformIds)
    const row = buildNamerCreativeRow(
      loaded.asset,
      loaded.brief,
      provenance,
      { gcsPath: loaded.asset.gcs_path ?? "", signedUrl },
      headerInfo.layout,
      thrmlIds.adId || thrmlIds.adSetId || thrmlIds.campaignId ? thrmlIds : undefined
    )
    if (!row) {
      errors.push(`${assetId}: could not build row`)
      continue
    }

    const values = mapRowToHeaderColumns(headers, row, headerInfo.layout, platformIds)
    const endCol = columnToLetter(headers.length - 1)
    const escapedTab = tabTitle.replace(/'/g, "''")
    const row1Based = sheetRow + 1
    updates.push({
      range: `'${escapedTab}'!A${row1Based}:${endCol}${row1Based}`,
      values: [values],
    })
    repaired++
  }

  if (updates.length) {
    await batchWriteCells(sheets, sheetId, updates)
  }

  return { repaired, errors }
}
