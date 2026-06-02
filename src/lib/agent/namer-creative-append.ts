/**
 * Append approved pipeline creatives to thrml_namer_v4 (Creative Builder tab)
 * and persist a JSON snapshot in the creative GCS bucket.
 *
 * Best-effort: callers should not fail asset approval when namer sync is unavailable.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  columnToLetter,
  createGoogleSheetsClient,
  listSpreadsheetTabs,
  readSheetValues,
  resolveTabTitle,
} from "@/lib/agent/google-sheets-client"
import { uploadBufferToCreativeObject, refreshCreativeAssetUrl } from "@/lib/agent/gcs"
import { parseAdName } from "@/lib/agent/naming-builder"

const CREATIVE_BUILDER_TAB_CANDIDATES = [
  "④ Creative Builder",
  "Creative Builder",
  "Ad Builder",
  "② Ad Builder",
  "2 Ad Builder",
]

/** thrml_namer_v4 — canonical Creative Builder destination. */
export const THRML_NAMER_V4_SHEET_ID = "1bSSZNmE8YENlkUOgHaS689Z1UpU8VAD6j5B0MnQK-HQ"

/** Trailing metadata columns — not part of → Ad Name / convention_name. */
export const NAMER_EXTENDED_HEADERS = [
  "Asset GCS Link",
  "Pipeline Template",
  "Asset UUID",
  "Brief Input",
  "Creative Gen",
  "Campaign Gen",
  "Ad Set Gen",
] as const

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

export type NamerCreativeRow = {
  adId: string
  adSetId: string
  campaignId: string
  testId: string
  variant: string
  angle: string
  formatType: string
  length: string
  aspectRatio: string
  cta: string
  adName: string
  hookPreview: string
  status: string
  platform: string
  phase: string
  optEvent: string
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

type BriefRow = {
  id: string
  trigger_type: string | null
  trigger_data: Record<string, unknown> | null
  created_by: string | null
  hook: string | null
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

export function buildNamerCreativeRow(
  asset: AssetRow,
  brief: BriefRow,
  provenance: { campaignGen: ProvenanceLabel; adSetGen: ProvenanceLabel },
  assetGcsLink: string
): NamerCreativeRow | null {
  const conventionName = asset.convention_name?.trim()
  if (!conventionName) return null

  const tokens = parseAdName(conventionName)
  if (!tokens) return null

  const [formatType, length, aspectRatio] = splitFormatToken(tokens.format)

  return {
    adId: "",
    adSetId: "",
    campaignId: "",
    testId: tokens.testId,
    variant: tokens.variant,
    angle: tokens.angle,
    formatType,
    length,
    aspectRatio,
    cta: tokens.cta,
    adName: conventionName,
    hookPreview: hookPreview(brief.hook),
    status: "Draft",
    platform: "",
    phase: "",
    optEvent: "",
    assetGcsLink,
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

function findCreativeBuilderHeader(
  rows: string[][]
): { headerRow: number; headers: string[]; layout: "v4" | "legacy" } | null {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const line = rows[r] ?? []
    const normalized = line.map((c) => String(c).trim())
    const joined = normalized.join(" ").toLowerCase()

    if (
      normalized.some((h) => /^test id$/i.test(h)) &&
      normalized.some((h) => /ad name/i.test(h) || h.startsWith("→"))
    ) {
      return { headerRow: r, headers: normalized, layout: "v4" }
    }

    if (
      normalized.some((h) => /^format type$/i.test(h)) &&
      normalized.some((h) => /ad name/i.test(h) || h.startsWith("→"))
    ) {
      return { headerRow: r, headers: normalized, layout: "v4" }
    }

    if (
      normalized.some((h) => /^concept$/i.test(h)) &&
      normalized.some((h) => /ad name/i.test(h) || h.startsWith("→"))
    ) {
      return { headerRow: r, headers: normalized, layout: "legacy" }
    }

    if (joined.includes("test id") && joined.includes("cta") && joined.includes("ad name")) {
      return { headerRow: r, headers: normalized, layout: "v4" }
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
  headers: string[]
): Promise<string[]> {
  const missing = NAMER_EXTENDED_HEADERS.filter(
    (label) => colIndex(headers, headerPatternsForExtended(label)) < 0
  )
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

function normalizeAspectRatio(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.toUpperCase() === "NA") return trimmed
  return trimmed.includes(":") ? trimmed : trimmed.replace(/x/i, ":")
}

function mapRowToHeaderColumns(
  headers: string[],
  row: NamerCreativeRow,
  layout: "v4" | "legacy"
): string[] {
  const values = new Array(headers.length).fill("")
  const set = (patterns: RegExp[], value: string) => {
    const idx = colIndex(headers, patterns)
    if (idx >= 0) values[idx] = value
  }

  set([/^ad id$/i], row.adId)
  set([/^ad set id$/i], row.adSetId)
  set([/^campaign id$/i], row.campaignId)

  if (layout === "v4") {
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
  set([/→?\s*ad name/i], row.adName)
  set([/^hook copy/i, /^hook$/i], row.hookPreview)
  set([/^status$/i], row.status)
  set([/^platform$/i], row.platform)
  set([/^phase$/i], row.phase)
  set([/^opt\.?\s*event$/i, /^conv\.?\s*event$/i], row.optEvent)

  set(headerPatternsForExtended("Asset GCS Link"), row.assetGcsLink)
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
    .select("id, trigger_type, trigger_data, created_by, hook")
    .eq("id", asset.brief_id)
    .maybeSingle()

  if (briefError) return { ok: false, reason: briefError.message }
  if (!brief) return { ok: false, reason: "Brief not found for asset" }

  const assetGcsLink = await resolveAssetGcsLink(asset as AssetRow)
  const provenance = await resolveRegistryProvenance(
    admin,
    asset as AssetRow,
    asset.convention_name.trim()
  )

  const row = buildNamerCreativeRow(
    asset as AssetRow,
    brief as BriefRow,
    provenance,
    assetGcsLink
  )
  if (!row) {
    return { ok: true, skipped: true, reason: "Could not parse convention_name for namer row" }
  }

  const sheets = createGoogleSheetsClient()
  let tabTitle: string
  let headerInfo: { headerRow: number; headers: string[]; layout: "v4" | "legacy" }
  let existingRows: string[][]

  try {
    const tabTitles = await listSpreadsheetTabs(sheets, sheetId)
    const resolvedTab = resolveTabTitle(tabTitles, ...CREATIVE_BUILDER_TAB_CANDIDATES)
    if (!resolvedTab) {
      return { ok: false, reason: "Creative Builder tab not found in namer sheet" }
    }
    tabTitle = resolvedTab

    existingRows = await readSheetValues(sheets, sheetId, tabTitle)
    const foundHeader = findCreativeBuilderHeader(existingRows)
    if (!foundHeader) {
      return { ok: false, reason: "Creative Builder header row not found" }
    }
    headerInfo = foundHeader
  } catch (err) {
    return { ok: false, reason: sheetsErrorMessage(err) }
  }

  for (let r = headerInfo.headerRow + 1; r < existingRows.length; r++) {
    if (rowHasAssetUuid(existingRows[r] ?? [], headerInfo.headers, assetId)) {
      await admin
        .from("creative_assets")
        .update({ namer_synced_at: new Date().toISOString() })
        .eq("id", assetId)
      return { ok: true, skipped: true, reason: "Row already present in sheet (Asset UUID)" }
    }
  }

  const headers = await ensureExtendedHeaders(
    sheets,
    sheetId,
    tabTitle,
    headerInfo.headerRow + 1,
    headerInfo.headers
  )

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
    assetGcsLink: assetGcsLink || undefined,
  }
}
