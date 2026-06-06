/**
 * Sync thrml_namer_v4 sheet rows ↔ Supabase paid-media tables (campaigns / ad_sets / ads).
 * Best-effort: callers must not fail primary flows when sync is unavailable.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { normalizeAngleForDb } from "@/lib/agent/namer-angle-map"
import {
  DEFAULT_BUDGET_MODE,
  normalizeAdFormatToken,
  parseAdSetConventionName,
  parseCampaignConventionName,
} from "@/lib/agent/namer-convention-parse"
import {
  cellValue,
  colIndex,
  findAdSetBuilderHeader,
  findCampaignBuilderHeader,
} from "@/lib/agent/namer-header-utils"
import { parseAdName, buildAdName } from "@/lib/agent/naming-builder"
import {
  batchWriteCells,
  columnToLetter,
  createGoogleSheetsClient,
  listSpreadsheetTabs,
  readSheetValues,
  resolveTabTitle,
} from "@/lib/agent/google-sheets-client"
import {
  findCreativeBuilderHeader,
  resolveNamerSheetId,
} from "@/lib/agent/namer-creative-append"
import { HEADER_PATTERNS, NAMER_TAB_CANDIDATES } from "@/lib/agent/namer-sheet-schema"
import type { CtaT, EventT, StatusT } from "@/types/paid-media"

export type PaidMediaSyncResult = {
  ok: boolean
  campaign_id?: string
  ad_set_id?: string
  ad_id?: string
  created?: boolean
  reason?: string
}

function mapSheetStatusToDb(status: string): StatusT {
  const s = status.trim().toUpperCase()
  if (s === "SCALE") return "SCALE"
  if (s === "TEST") return "TEST"
  if (s === "PAUSED") return "PAUSED"
  if (s === "KILLED" || s === "ARCHIVED") return "KILLED"
  return "DRAFT"
}

function normalizeCta(raw: string): CtaT {
  const allowed: CtaT[] = [
    "list_now",
    "learn_more",
    "get_started",
    "see_how",
    "book_now",
    "explore",
    "join_waitlist",
  ]
  const v = raw.trim().toLowerCase()
  return allowed.includes(v as CtaT) ? (v as CtaT) : "list_now"
}

async function loadBuilderTab(sheetId: string, kind: "campaign" | "ad_set" | "ad") {
  const sheets = createGoogleSheetsClient()
  const tabs = await listSpreadsheetTabs(sheets, sheetId)
  const tab = resolveTabTitle(
    tabs,
    ...(kind === "campaign"
      ? NAMER_TAB_CANDIDATES.campaign
      : kind === "ad_set"
        ? NAMER_TAB_CANDIDATES.ad_set
        : NAMER_TAB_CANDIDATES.ad)
  )
  if (!tab) return null

  const rows = await readSheetValues(sheets, sheetId, tab)
  const header =
    kind === "campaign"
      ? findCampaignBuilderHeader(rows)
      : kind === "ad_set"
        ? findAdSetBuilderHeader(rows)
        : findCreativeBuilderHeader(rows)
  if (!header) return null

  return { sheets, tab, rows, header: header.headers, headerRow: header.headerRow }
}

function legacyIdPatterns(kind: "campaign" | "ad_set" | "ad"): RegExp[] {
  if (kind === "campaign") return [/^camp id$/i, /^campaign id$/i]
  if (kind === "ad_set") return [/^adset id$/i, /^ad set id$/i]
  return [/^ad id$/i]
}

function findRowByLegacyId(
  rows: string[][],
  headerRow: number,
  headers: string[],
  legacyId: string,
  kind: "campaign" | "ad_set" | "ad"
): string[] | null {
  const keyCol = colIndex(headers, legacyIdPatterns(kind))
  if (keyCol < 0) return null
  const target = legacyId.trim().toUpperCase()
  for (let r = headerRow + 1; r < rows.length; r++) {
    if ((rows[r]?.[keyCol] ?? "").trim().toUpperCase() === target) return rows[r] ?? []
  }
  return null
}

function findRowByPlatformId(
  rows: string[][],
  headerRow: number,
  headers: string[],
  platformPatterns: readonly RegExp[],
  platformId: string
): string[] | null {
  const col = colIndex(headers, platformPatterns)
  if (col < 0) return null
  const target = platformId.replace(/\D/g, "").trim()
  for (let r = headerRow + 1; r < rows.length; r++) {
    const raw = (rows[r]?.[col] ?? "").trim().replace(/\D/g, "")
    if (raw && raw === target) return rows[r] ?? []
  }
  return null
}

export async function upsertCampaignFromNamer(
  admin: SupabaseClient,
  opts: { legacyId?: string; platformCampaignId?: string }
): Promise<PaidMediaSyncResult> {
  const legacyId = opts.legacyId?.trim().toUpperCase()
  const platformCampaignId = opts.platformCampaignId?.trim()
  if (!legacyId && !platformCampaignId) {
    return { ok: false, reason: "legacyId or platformCampaignId required" }
  }

  if (legacyId) {
    const { data: existing } = await admin
      .from("campaigns")
      .select("id")
      .eq("legacy_id", legacyId)
      .maybeSingle()
    if (existing?.id && platformCampaignId) {
      await admin
        .from("campaigns")
        .update({
          platform_campaign_id: platformCampaignId,
          status: "TEST",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
      return { ok: true, campaign_id: existing.id, created: false }
    }
    if (existing?.id) return { ok: true, campaign_id: existing.id, created: false }
  }

  const sheetId = await resolveNamerSheetId(admin)
  if (!sheetId) return { ok: false, reason: "NAMER_SHEET_ID not configured" }

  const tab = await loadBuilderTab(sheetId, "campaign")
  if (!tab) return { ok: false, reason: "Campaign Builder not readable" }

  const row =
    (legacyId && findRowByLegacyId(tab.rows, tab.headerRow, tab.header, legacyId, "campaign")) ||
    (platformCampaignId &&
      findRowByPlatformId(
        tab.rows,
        tab.headerRow,
        tab.header,
        HEADER_PATTERNS.platformCampaignId,
        platformCampaignId
      ))

  if (!row) return { ok: false, reason: "Campaign row not found in sheet" }

  const campLegacy =
    legacyId ||
    cellValue(row, tab.header, [/^camp id$/i, ...HEADER_PATTERNS.thrmlCampaignId]).toUpperCase()
  const autoName = cellValue(row, tab.header, [/^campaign name/i])
  const parsed = parseCampaignConventionName(autoName)
  if (!parsed) return { ok: false, reason: `Could not parse campaign name: ${autoName}` }

  const platformId =
    platformCampaignId ||
    cellValue(row, tab.header, HEADER_PATTERNS.platformCampaignId)
  const status = mapSheetStatusToDb(cellValue(row, tab.header, HEADER_PATTERNS.status))
  const budgetRaw = cellValue(row, tab.header, [/budget\/day/i, /daily budget/i])
  const daily_budget_usd = budgetRaw ? Number.parseFloat(budgetRaw.replace(/[^0-9.]/g, "")) : null

  const payload = {
    legacy_id: campLegacy || parsed.legacy_id,
    name: parsed.name,
    platform: parsed.platform,
    persona: parsed.persona,
    service: parsed.service,
    geo: parsed.geo,
    phase: parsed.phase,
    funnel: parsed.funnel,
    event: parsed.event,
    launch_week: parsed.launch_week,
    version: parsed.version,
    status: platformId ? "TEST" : status,
    daily_budget_usd: Number.isFinite(daily_budget_usd) ? daily_budget_usd : null,
    budget_mode: DEFAULT_BUDGET_MODE,
    platform_campaign_id: platformId || null,
    updated_at: new Date().toISOString(),
    created_by: "CREATIVE_AGENT" as const,
  }

  const { data, error } = await admin
    .from("campaigns")
    .upsert(payload, { onConflict: "legacy_id" })
    .select("id")
    .single()

  if (error) return { ok: false, reason: error.message }
  return { ok: true, campaign_id: data.id, created: true }
}

export async function upsertAdSetFromNamer(
  admin: SupabaseClient,
  opts: { legacyId?: string; platformAdSetId?: string; platformCampaignId?: string }
): Promise<PaidMediaSyncResult> {
  const legacyId = opts.legacyId?.trim().toUpperCase()
  const platformAdSetId = opts.platformAdSetId?.trim()
  if (!legacyId && !platformAdSetId) {
    return { ok: false, reason: "legacyId or platformAdSetId required" }
  }

  if (legacyId) {
    const { data: existing } = await admin
      .from("ad_sets")
      .select("id, campaign_id")
      .eq("legacy_id", legacyId)
      .maybeSingle()
    if (existing?.id && platformAdSetId) {
      await admin
        .from("ad_sets")
        .update({
          platform_adset_id: platformAdSetId,
          status: "TEST",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
      return { ok: true, ad_set_id: existing.id, campaign_id: existing.campaign_id, created: false }
    }
    if (existing?.id) {
      return {
        ok: true,
        ad_set_id: existing.id,
        campaign_id: existing.campaign_id,
        created: false,
      }
    }
  }

  const sheetId = await resolveNamerSheetId(admin)
  if (!sheetId) return { ok: false, reason: "NAMER_SHEET_ID not configured" }

  const tab = await loadBuilderTab(sheetId, "ad_set")
  if (!tab) return { ok: false, reason: "Ad Set Builder not readable" }

  const row =
    (legacyId && findRowByLegacyId(tab.rows, tab.headerRow, tab.header, legacyId, "ad_set")) ||
    (platformAdSetId &&
      findRowByPlatformId(
        tab.rows,
        tab.headerRow,
        tab.header,
        HEADER_PATTERNS.platformAdSetId,
        platformAdSetId
      ))

  if (!row) return { ok: false, reason: "Ad set row not found in sheet" }

  const adSetLegacy =
    legacyId ||
    cellValue(row, tab.header, HEADER_PATTERNS.thrmlAdSetId).toUpperCase()
  const campLegacy = cellValue(row, tab.header, [/^camp id$/i, ...HEADER_PATTERNS.thrmlCampaignId])
  const autoName = cellValue(row, tab.header, [/^ad set name/i])
  const parsed = parseAdSetConventionName(autoName)
  if (!parsed) return { ok: false, reason: `Could not parse ad set name: ${autoName}` }

  const campResult = await upsertCampaignFromNamer(admin, {
    legacyId: campLegacy || undefined,
    platformCampaignId:
      opts.platformCampaignId ||
      cellValue(row, tab.header, HEADER_PATTERNS.platformCampaignId) ||
      undefined,
  })
  if (!campResult.ok || !campResult.campaign_id) {
    return { ok: false, reason: campResult.reason ?? "Parent campaign sync failed" }
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("event")
    .eq("id", campResult.campaign_id)
    .maybeSingle()

  const conv_event = (campaign?.event as EventT | undefined) ?? "BH"
  const platformId =
    platformAdSetId || cellValue(row, tab.header, HEADER_PATTERNS.platformAdSetId)

  const payload = {
    legacy_id: adSetLegacy || parsed.legacy_id,
    campaign_id: campResult.campaign_id,
    name: parsed.name,
    audience_src: parsed.audience_src,
    placement: parsed.placement,
    conv_event,
    status: platformId ? "TEST" : mapSheetStatusToDb(cellValue(row, tab.header, HEADER_PATTERNS.status)),
    platform_adset_id: platformId || null,
    audience_details: cellValue(row, tab.header, [/^notes$/i, /audience details/i]) || null,
    updated_at: new Date().toISOString(),
    created_by: "CREATIVE_AGENT" as const,
  }

  const { data, error } = await admin
    .from("ad_sets")
    .upsert(payload, { onConflict: "legacy_id" })
    .select("id, campaign_id")
    .single()

  if (error) return { ok: false, reason: error.message }
  return {
    ok: true,
    ad_set_id: data.id,
    campaign_id: data.campaign_id,
    created: true,
  }
}

export async function upsertAdFromNamerCreative(
  admin: SupabaseClient,
  opts: {
    conventionName: string
    legacyAdId?: string
    adSetLegacyId?: string
    platformAdId?: string
    platformAdSetId?: string
    gcsPath?: string | null
    hookCopy?: string | null
    status?: StatusT
  }
): Promise<PaidMediaSyncResult> {
  const tokens = parseAdName(opts.conventionName.trim())
  if (!tokens) return { ok: false, reason: "Invalid convention_name" }

  const adSetResult = await upsertAdSetFromNamer(admin, {
    legacyId: opts.adSetLegacyId,
    platformAdSetId: opts.platformAdSetId,
  })
  if (!adSetResult.ok || !adSetResult.ad_set_id || !adSetResult.campaign_id) {
    return { ok: false, reason: adSetResult.reason ?? "Ad set sync failed" }
  }

  let legacyId = opts.legacyAdId?.trim().toUpperCase() || tokens.thrmlAdId?.toUpperCase()
  if (!legacyId && opts.platformAdId) {
    const { data: byPlatform } = await admin
      .from("ads")
      .select("legacy_id")
      .eq("platform_ad_id", opts.platformAdId.trim())
      .maybeSingle()
    if (byPlatform?.legacy_id) legacyId = String(byPlatform.legacy_id).toUpperCase()
  }

  const adName = legacyId ? buildAdName({ ...tokens, thrmlAdId: legacyId }) : opts.conventionName.trim()

  const { data: campaign } = await admin
    .from("campaigns")
    .select("event")
    .eq("id", adSetResult.campaign_id)
    .maybeSingle()

  const conv_event = (campaign?.event as EventT | undefined) ?? "BH"

  const payload = {
    legacy_id: legacyId,
    ad_set_id: adSetResult.ad_set_id,
    campaign_id: adSetResult.campaign_id,
    name: adName,
    test_id: tokens.testId,
    variant: tokens.variant.toUpperCase().slice(0, 1),
    angle: normalizeAngleForDb(tokens.angle),
    format: normalizeAdFormatToken(tokens.format),
    cta: normalizeCta(tokens.cta),
    hook_copy: opts.hookCopy?.trim() || null,
    gcs_path: opts.gcsPath?.trim() || null,
    status: opts.status ?? (opts.platformAdId ? "TEST" : "DRAFT"),
    platform_ad_id: opts.platformAdId?.trim() || null,
    conv_event,
    updated_at: new Date().toISOString(),
    created_by: "CREATIVE_AGENT" as const,
  }

  const conflictKey = legacyId ? "legacy_id" : undefined
  if (!conflictKey) {
    const { data, error } = await admin.from("ads").insert(payload).select("id").single()
    if (error) return { ok: false, reason: error.message }
    return {
      ok: true,
      ad_id: data.id,
      ad_set_id: adSetResult.ad_set_id,
      campaign_id: adSetResult.campaign_id,
      created: true,
    }
  }

  const { data, error } = await admin
    .from("ads")
    .upsert(payload, { onConflict: "legacy_id" })
    .select("id")
    .single()

  if (error) return { ok: false, reason: error.message }
  return {
    ok: true,
    ad_id: data.id,
    ad_set_id: adSetResult.ad_set_id,
    campaign_id: adSetResult.campaign_id,
    created: true,
  }
}

export async function syncPaidMediaFromCreativeLaunch(
  admin: SupabaseClient,
  assetId: string
): Promise<PaidMediaSyncResult> {
  const { data: asset, error } = await admin
    .from("creative_assets")
    .select("id, brief_id, convention_name, gcs_path, meta_ad_id, meta_adset_id")
    .eq("id", assetId)
    .maybeSingle()

  if (error || !asset?.convention_name?.trim()) {
    return { ok: false, reason: error?.message ?? "Asset missing convention_name" }
  }

  const { data: brief } = asset.brief_id
    ? await admin
        .from("creative_briefs")
        .select("hook, copy_headline")
        .eq("id", asset.brief_id)
        .maybeSingle()
    : { data: null }

  const sheetId = await resolveNamerSheetId(admin)
  let adSetLegacyId: string | undefined
  let legacyAdId: string | undefined

  if (sheetId) {
    const tab = await loadBuilderTab(sheetId, "ad")
    if (tab) {
      const uuidCol = colIndex(tab.header, [/^asset uuid$/i])
      if (uuidCol >= 0) {
        for (let r = tab.headerRow + 1; r < tab.rows.length; r++) {
          if ((tab.rows[r]?.[uuidCol] ?? "").trim() === assetId) {
            const line = tab.rows[r] ?? []
            adSetLegacyId =
              cellValue(line, tab.header, HEADER_PATTERNS.thrmlAdSetId) || undefined
            legacyAdId = cellValue(line, tab.header, HEADER_PATTERNS.thrmlAdId) || undefined
            break
          }
        }
      }
    }
  }

  const hookCopy = brief?.hook || brief?.copy_headline || null

  return upsertAdFromNamerCreative(admin, {
    conventionName: asset.convention_name.trim(),
    legacyAdId,
    adSetLegacyId,
    platformAdId: asset.meta_ad_id,
    platformAdSetId: asset.meta_adset_id,
    gcsPath: asset.gcs_path,
    hookCopy,
    status: asset.meta_ad_id ? "TEST" : "DRAFT",
  })
}

export async function patchNamerSheetPlatformId(
  admin: SupabaseClient,
  entity: "campaign" | "ad_set" | "ad",
  legacyId: string,
  platformId: string
): Promise<{ ok: boolean; reason?: string }> {
  const sheetId = await resolveNamerSheetId(admin)
  if (!sheetId || !legacyId.trim() || !platformId.trim()) {
    return { ok: true, reason: "Skipped — sheet or ids missing" }
  }

  const kind = entity === "campaign" ? "campaign" : entity === "ad_set" ? "ad_set" : "ad"
  const tab = await loadBuilderTab(sheetId, kind)
  if (!tab) return { ok: false, reason: `${kind} tab not found` }

  const kindKey = entity === "campaign" ? "campaign" : entity === "ad_set" ? "ad_set" : "ad"
  const rowIdx = tab.rows.findIndex((row, r) => {
    if (r <= tab.headerRow) return false
    const key = cellValue(row, tab.header, legacyIdPatterns(kindKey))
    return key.toUpperCase() === legacyId.trim().toUpperCase()
  })

  if (rowIdx < 0) return { ok: true, reason: "Row not in sheet" }

  const platformPatterns =
    entity === "campaign"
      ? HEADER_PATTERNS.platformCampaignId
      : entity === "ad_set"
        ? HEADER_PATTERNS.platformAdSetId
        : HEADER_PATTERNS.platformAdId

  const col = colIndex(tab.header, platformPatterns)
  if (col < 0) return { ok: true, reason: "Platform column missing" }

  const escaped = tab.tab.replace(/'/g, "''")
  await batchWriteCells(tab.sheets, sheetId, [
    {
      range: `'${escaped}'!${columnToLetter(col)}${rowIdx + 1}`,
      values: [[platformId.trim()]],
    },
  ])

  return { ok: true }
}
