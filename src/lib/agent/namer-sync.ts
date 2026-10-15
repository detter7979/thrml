/**
 * Namer sync agent — Meta Ads Manager → Google Sheets (one-way).
 *
 * Architecture:
 * - **Source of truth for delivery state:** Meta (`effective_status` on campaigns, ad sets, ads).
 * - **Human taxonomy & naming:** the namer Sheet (Campaign / Ad Set / Ad Builder tabs).
 * - **Join keys:** Platform Camp ID, Platform AdSet ID, Platform Ad ID columns in the Sheet.
 * - **Downstream:** reporting-agent ingests performance; evaluator reads Supabase paid-media tables.
 * - Fills empty Platform ID cells by matching builder IDs to Meta name prefixes (C001_, AS001_, AD001_);
 *   ad sets/ads are matched under their own parent so an ID reused in two campaigns can't cross-link.
 * - Then copies Campaign / Ad Set Builder rows into Supabase (namer-db-sync). Never writes to Meta.
 *
 * Cron: `/api/cron/namer-sync` (daily). Env: `NAMER_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`,
 * `META_MARKETING_API_TOKEN`, `META_AD_ACCOUNT_ID`.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  a1Range,
  batchWriteCells,
  createGoogleSheetsClient,
  ensureTabExists,
  getNamerSheetId,
  listSpreadsheetTabs,
  readSheetValues,
  replaceTabValues,
  resolveTabTitle,
} from "@/lib/agent/google-sheets-client"
import { syncNamerBuildersToDb, type NamerDbSyncResult } from "@/lib/agent/namer-db-sync"
import {
  fetchMetaAd,
  fetchMetaAdSet,
  fetchMetaCampaign,
  listMetaAds,
  listMetaAdSets,
  listMetaCampaigns,
  type MetaObjectFetchResult,
} from "@/lib/agent/namer-meta-client"

/** actions_log.kind is AGENT_RUN; payload.sync_kind = NAMER_SYNC (rec_kind_t has no NAMER_SYNC). */
const EXECUTOR = "SYSTEM" as const
const LOG_KIND = "AGENT_RUN" as const
const SYNC_KIND = "NAMER_SYNC" as const
const UNMATCHED_TAB = "Unmatched"

export type NamerSyncResult = {
  ok: boolean
  runId: string | null
  error?: string
  duration_ms: number
  campaigns_processed: number
  campaigns_skipped: number
  ad_sets_processed: number
  ad_sets_skipped: number
  ads_processed: number
  ads_skipped: number
  sheet_cells_updated: number
  awaiting_meta_build: number
  unmatched_written: number
  changes: NamerChangeRecord[]
  /** Platform IDs filled in from Meta name prefixes this run. */
  linked?: { entity: "campaign" | "ad_set" | "ad"; internal_id: string; platform_id: string }[]
  db_sync?: NamerDbSyncResult | { error: string }
  reason?: string
}

export type NamerChangeRecord = {
  entity: "campaign" | "ad_set" | "ad"
  platform_id: string
  internal_id?: string
  from_status: string
  to_status: string
  meta_effective_status: string
}

type SheetEntityConfig = {
  entity: "campaign" | "ad_set" | "ad"
  tabCandidates: string[]
  platformIdHeader: RegExp[]
  internalIdHeader: RegExp[]
  statusHeader: RegExp[]
  scaleHintHeader: RegExp[]
  /** Builder column holding the parent's internal ID (Camp ID on Ad Set Builder, AdSet ID on Ad Builder). */
  parentIdHeader: RegExp[]
  fetchMeta: (id: string) => Promise<MetaObjectFetchResult>
  listMeta: () => Promise<{ id: string; name?: string; effective_status?: string }[]>
}

type MetaListItem = {
  id: string
  name?: string
  effective_status?: string
  campaign_id?: string
  adset_id?: string
}

const ENTITY_CONFIGS: SheetEntityConfig[] = [
  {
    entity: "campaign",
    tabCandidates: ["Campaign Builder", "② Campaign Builder", "2 Campaign Builder"],
    platformIdHeader: [/platform\s*camp\s*id/i],
    internalIdHeader: [/^campaign\s*id$/i, /^camp\s*id$/i],
    statusHeader: [/^status$/i],
    scaleHintHeader: [/scale/i, /priority/i],
    parentIdHeader: [],
    fetchMeta: fetchMetaCampaign,
    listMeta: listMetaCampaigns,
  },
  {
    entity: "ad_set",
    tabCandidates: ["Ad Set Builder", "② Ad Set Builder", "2 Ad Set Builder"],
    platformIdHeader: [/platform\s*ad\s*set\s*id/i, /platform\s*adset\s*id/i],
    internalIdHeader: [/^ad\s*set\s*id$/i],
    statusHeader: [/^status$/i],
    scaleHintHeader: [/scale/i, /priority/i],
    parentIdHeader: [/^camp\s*id$/i, /^campaign\s*id$/i],
    fetchMeta: fetchMetaAdSet,
    listMeta: listMetaAdSets,
  },
  {
    entity: "ad",
    tabCandidates: ["Ad Builder", "Creative Builder", "② Ad Builder", "2 Ad Builder"],
    platformIdHeader: [/platform\s*ad\s*id/i],
    internalIdHeader: [/^ad\s*id$/i],
    statusHeader: [/^status$/i],
    scaleHintHeader: [/scale/i, /priority/i],
    parentIdHeader: [/^ad\s*set\s*id$/i, /^adset\s*id$/i],
    fetchMeta: fetchMetaAd,
    listMeta: listMetaAds,
  },
]

function findHeaderRow(rows: string[][]): { headerRow: number; headers: string[] } | null {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const line = rows[r] ?? []
    const joined = line.join(" ").toLowerCase()
    if (
      joined.includes("platform") &&
      (joined.includes("camp") || joined.includes("ad set") || joined.includes("ad id") || joined.includes("adset"))
    ) {
      return { headerRow: r, headers: line.map((c) => String(c).trim()) }
    }
    if (joined.includes("campaign id") && joined.includes("status")) {
      return { headerRow: r, headers: line.map((c) => String(c).trim()) }
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

function normalizePlatformId(raw: string): string {
  return raw.replace(/\D/g, "").trim()
}

function isScaleLabeled(row: string[], headers: string[], scalePatterns: RegExp[]): boolean {
  const statusCol = colIndex(headers, [/^status$/i])
  if (statusCol >= 0) {
    const st = (row[statusCol] ?? "").trim().toUpperCase()
    if (st === "SCALE") return true
  }
  for (let i = 0; i < headers.length; i++) {
    if (scalePatterns.some((p) => p.test(headers[i] ?? ""))) {
      const v = (row[i] ?? "").trim().toLowerCase()
      if (v === "scale" || v.includes("scale")) return true
    }
  }
  return false
}

/** Map Meta effective_status → thrml Sheet Status taxonomy. */
export function mapMetaEffectiveStatusToSheet(
  effectiveStatus: string,
  row: string[],
  headers: string[],
  scalePatterns: RegExp[]
): string {
  const es = effectiveStatus.trim().toUpperCase()
  const scale = isScaleLabeled(row, headers, scalePatterns)

  if (es === "ACTIVE") return scale ? "SCALE" : "TEST"
  if (es === "PAUSED" || es === "PAUSED_FROM_REVIEW" || es === "CAMPAIGN_PAUSED" || es === "ADSET_PAUSED") {
    return "PAUSED"
  }
  if (es === "DELETED" || es === "ARCHIVED") return "ARCHIVED"
  if (es === "WITH_ISSUES" || es === "DISAPPROVED" || es === "PENDING_REVIEW" || es === "IN_PROCESS") {
    return "DRAFT"
  }
  return "DRAFT"
}

type TabSyncStats = {
  processed: number
  skipped: number
  cellsUpdated: number
  awaitingMetaBuild: number
  changes: NamerChangeRecord[]
  platformIdsInSheet: Set<string>
}

/** Internal ID prefix of a Meta name ("AS002_int-income_FEED-STORIES" → "AS002"), or "". */
export function metaNamePrefix(name: string | undefined): string {
  const m = /^(C|AS|AD)(\d{3,})_/i.exec((name ?? "").trim())
  return m ? `${m[1]!.toUpperCase()}${m[2]}` : ""
}

export type AutoLinkCandidate = { id: string; parentPlatformId: string }

/**
 * Pick the Meta object for a builder row by name prefix. When the same prefix is used under
 * several parents (an ID collision in Meta), only the one under the row's own parent counts.
 * Returns null when nothing (or more than one thing) matches.
 */
export function pickAutoLink(
  candidates: AutoLinkCandidate[],
  parentPlatformId: string | null,
  taken: Set<string>
): string | null {
  const free = candidates.filter((c) => !taken.has(c.id))
  if (parentPlatformId) {
    const under = free.filter((c) => c.parentPlatformId === parentPlatformId)
    return under.length === 1 ? under[0]!.id : null
  }
  return free.length === 1 ? free[0]!.id : null
}

type AutoLinkStats = { linked: { entity: SheetEntityConfig["entity"]; internal_id: string; platform_id: string }[] }

/**
 * Fill empty Platform ID cells by matching builder IDs to the prefix Meta names carry (C001_, AS001_, AD001_).
 * Also returns internal ID → platform ID for every row (existing + new) so children can scope by parent.
 */
async function autoLinkTab(
  sheets: ReturnType<typeof createGoogleSheetsClient>,
  spreadsheetId: string,
  tabTitle: string,
  config: SheetEntityConfig,
  metaItems: MetaListItem[],
  parentLinks: Map<string, string>,
  stats: AutoLinkStats
): Promise<Map<string, string>> {
  const links = new Map<string, string>()
  const rows = await readSheetValues(sheets, spreadsheetId, tabTitle)
  const headerInfo = findHeaderRow(rows)
  if (!headerInfo) return links
  const { headerRow, headers } = headerInfo
  const platformCol = colIndex(headers, config.platformIdHeader)
  const internalCol = colIndex(headers, config.internalIdHeader)
  const parentCol = config.parentIdHeader.length ? colIndex(headers, config.parentIdHeader) : -1
  if (platformCol < 0 || internalCol < 0) return links

  const byPrefix = new Map<string, AutoLinkCandidate[]>()
  for (const m of metaItems) {
    const prefix = metaNamePrefix(m.name)
    if (!prefix) continue
    const parent = config.entity === "ad_set" ? m.campaign_id : config.entity === "ad" ? m.adset_id : ""
    const list = byPrefix.get(prefix) ?? []
    list.push({ id: normalizePlatformId(m.id), parentPlatformId: normalizePlatformId(parent ?? "") })
    byPrefix.set(prefix, list)
  }

  const taken = new Set<string>()
  for (let r = headerRow + 1; r < rows.length; r++) {
    const pid = normalizePlatformId(rows[r]?.[platformCol] ?? "")
    if (pid) taken.add(pid)
  }

  const updates: { range: string; values: string[][] }[] = []
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const internalId = (row[internalCol] ?? "").trim().toUpperCase()
    if (!internalId) continue
    const existing = normalizePlatformId(row[platformCol] ?? "")
    if (existing) {
      links.set(internalId, existing)
      continue
    }
    const candidates = byPrefix.get(internalId)
    if (!candidates?.length) continue
    const parentInternal = parentCol >= 0 ? (row[parentCol] ?? "").trim().toUpperCase() : ""
    const parentPlatformId = parentInternal ? (parentLinks.get(parentInternal) ?? null) : null
    // A child whose parent is not linked yet can only be matched when the prefix is unambiguous.
    const picked = pickAutoLink(candidates, config.entity === "campaign" ? null : parentPlatformId, taken)
    if (!picked) continue
    taken.add(picked)
    links.set(internalId, picked)
    updates.push({ range: a1Range(tabTitle, platformCol, r + 1), values: [[picked]] })
    stats.linked.push({ entity: config.entity, internal_id: internalId, platform_id: picked })
  }
  if (updates.length) await batchWriteCells(sheets, spreadsheetId, updates)
  return links
}

async function syncTab(
  sheets: ReturnType<typeof createGoogleSheetsClient>,
  spreadsheetId: string,
  tabTitle: string,
  config: SheetEntityConfig
): Promise<TabSyncStats> {
  const stats: TabSyncStats = {
    processed: 0,
    skipped: 0,
    cellsUpdated: 0,
    awaitingMetaBuild: 0,
    changes: [],
    platformIdsInSheet: new Set(),
  }

  const rows = await readSheetValues(sheets, spreadsheetId, tabTitle)
  const headerInfo = findHeaderRow(rows)
  if (!headerInfo) {
    console.warn(`[namer-sync] Could not find header row on tab "${tabTitle}"`)
    return stats
  }

  const { headerRow, headers } = headerInfo
  const platformCol = colIndex(headers, config.platformIdHeader)
  const internalCol = colIndex(headers, config.internalIdHeader)
  const statusCol = colIndex(headers, config.statusHeader)

  if (platformCol < 0 || statusCol < 0) {
    console.warn(`[namer-sync] Tab "${tabTitle}" missing Platform ID or Status column`)
    return stats
  }

  const cellUpdates: { range: string; values: string[][] }[] = []

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const platformRaw = (row[platformCol] ?? "").trim()
    const platformId = normalizePlatformId(platformRaw)
    const internalId = internalCol >= 0 ? (row[internalCol] ?? "").trim() : ""
    const currentStatus = (row[statusCol] ?? "").trim()

    if (!platformId && !internalId) continue
    if (!platformId && internalId) {
      stats.awaitingMetaBuild += 1
      continue
    }
    if (!platformId) continue

    stats.platformIdsInSheet.add(platformId)
    stats.processed += 1

    const metaRes = await config.fetchMeta(platformId)
    if (!metaRes.ok) {
      if (metaRes.unavailable) {
        console.warn(`[namer-sync] Meta object ${platformId} unavailable — marking ARCHIVED in Sheet`)
        const next = "ARCHIVED"
        if (currentStatus.toUpperCase() !== next) {
          const sheetRow = r + 1
          cellUpdates.push({
            range: a1Range(tabTitle, statusCol, sheetRow),
            values: [[next]],
          })
          stats.changes.push({
            entity: config.entity,
            platform_id: platformId,
            internal_id: internalId || undefined,
            from_status: currentStatus,
            to_status: next,
            meta_effective_status: "UNAVAILABLE",
          })
        }
        continue
      }
      console.error(`[namer-sync] Meta fetch failed for ${platformId}:`, metaRes.error)
      stats.skipped += 1
      continue
    }

    const es = metaRes.data.effective_status || metaRes.data.status || ""
    const nextStatus = mapMetaEffectiveStatusToSheet(es, row, headers, config.scaleHintHeader)
    if (currentStatus.toUpperCase() === nextStatus.toUpperCase()) continue

    const sheetRow = r + 1
    cellUpdates.push({
      range: a1Range(tabTitle, statusCol, sheetRow),
      values: [[nextStatus]],
    })
    stats.changes.push({
      entity: config.entity,
      platform_id: platformId,
      internal_id: internalId || undefined,
      from_status: currentStatus,
      to_status: nextStatus,
      meta_effective_status: es,
    })
  }

  if (cellUpdates.length) {
    await batchWriteCells(sheets, spreadsheetId, cellUpdates)
    stats.cellsUpdated = cellUpdates.length
  }

  return stats
}

function unmatchedNote(
  name: string | undefined,
  builderTab: string,
  linked: Map<string, string>
): string {
  const prefix = metaNamePrefix(name)
  if (!prefix) return `No ID prefix in the Meta name — add a row in ${builderTab}, then rename in Meta`
  if (linked.has(prefix)) {
    return `${prefix} is already linked to another Meta object — rename this one per the Meta Rename Map tab`
  }
  return `${prefix} not found in ${builderTab} (or its parent doesn't match) — add/fix the row`
}

function buildUnmatchedRows(
  campaigns: MetaListItem[],
  adSets: MetaListItem[],
  ads: MetaListItem[],
  inSheet: { campaigns: Set<string>; adSets: Set<string>; ads: Set<string> },
  linked: { campaigns: Map<string, string>; adSets: Map<string, string>; ads: Map<string, string> } = {
    campaigns: new Map(),
    adSets: new Map(),
    ads: new Map(),
  }
): string[][] {
  const out: string[][] = [
    [
      "Entity",
      "Platform ID",
      "Name",
      "Meta effective_status",
      "Parent campaign ID",
      "Parent ad set ID",
      "Note",
    ],
  ]

  for (const c of campaigns) {
    const id = normalizePlatformId(c.id)
    if (!id || inSheet.campaigns.has(id)) continue
    out.push([
      "campaign",
      id,
      c.name ?? "",
      c.effective_status ?? "",
      "",
      "",
      unmatchedNote(c.name, "Campaign Builder", linked.campaigns),
    ])
  }
  for (const s of adSets) {
    const id = normalizePlatformId(s.id)
    if (!id || inSheet.adSets.has(id)) continue
    out.push([
      "ad_set",
      id,
      s.name ?? "",
      s.effective_status ?? "",
      s.campaign_id ?? "",
      "",
      unmatchedNote(s.name, "Ad Set Builder", linked.adSets),
    ])
  }
  for (const a of ads) {
    const id = normalizePlatformId(a.id)
    if (!id || inSheet.ads.has(id)) continue
    out.push([
      "ad",
      id,
      a.name ?? "",
      a.effective_status ?? "",
      a.campaign_id ?? "",
      a.adset_id ?? "",
      unmatchedNote(a.name, "Ad Builder", linked.ads),
    ])
  }
  return out
}

function unmatchedFingerprint(rows: string[][]): string {
  return JSON.stringify(rows)
}

export async function runNamerSync(admin: SupabaseClient): Promise<NamerSyncResult> {
  const t0 = Date.now()
  const changes: NamerChangeRecord[] = []
  let campaigns_processed = 0
  let campaigns_skipped = 0
  let ad_sets_processed = 0
  let ad_sets_skipped = 0
  let ads_processed = 0
  let ads_skipped = 0
  let sheet_cells_updated = 0
  let awaiting_meta_build = 0
  let unmatched_written = 0

  const { data: runInsert, error: runErr } = await admin
    .from("actions_log")
    .insert({
      kind: LOG_KIND,
      executed_by: EXECUTOR,
      payload: { run_type: "namer_sync", sync_kind: SYNC_KIND, phase: "started" },
      success: false,
    })
    .select("id")
    .single()

  if (runErr || !runInsert?.id) {
    return {
      ok: false,
      runId: null,
      error: runErr?.message ?? "Failed to create actions_log run",
      duration_ms: Date.now() - t0,
      campaigns_processed: 0,
      campaigns_skipped: 0,
      ad_sets_processed: 0,
      ad_sets_skipped: 0,
      ads_processed: 0,
      ads_skipped: 0,
      sheet_cells_updated: 0,
      awaiting_meta_build: 0,
      unmatched_written: 0,
      changes: [],
    }
  }

  const runId = runInsert.id as string

  try {
    const spreadsheetId = getNamerSheetId()
    const sheets = createGoogleSheetsClient()
    const tabTitles = await listSpreadsheetTabs(sheets, spreadsheetId)

    const platformInSheet = {
      campaigns: new Set<string>(),
      adSets: new Set<string>(),
      ads: new Set<string>(),
    }

    const [metaCampaigns, metaAdSets, metaAds] = (await Promise.all([
      listMetaCampaigns(),
      listMetaAdSets(),
      listMetaAds(),
    ])) as [MetaListItem[], MetaListItem[], MetaListItem[]]
    const metaByEntity: Record<SheetEntityConfig["entity"], MetaListItem[]> = {
      campaign: metaCampaigns,
      ad_set: metaAdSets,
      ad: metaAds,
    }
    const linked = { campaigns: new Map<string, string>(), adSets: new Map<string, string>(), ads: new Map<string, string>() }
    const linkStats: AutoLinkStats = { linked: [] }

    for (const config of ENTITY_CONFIGS) {
      const tabTitle = resolveTabTitle(tabTitles, ...config.tabCandidates)
      if (!tabTitle) {
        console.warn(`[namer-sync] Tab not found for ${config.entity}:`, config.tabCandidates.join(", "))
        continue
      }

      const parentLinks =
        config.entity === "ad_set" ? linked.campaigns : config.entity === "ad" ? linked.adSets : new Map<string, string>()
      const links = await autoLinkTab(
        sheets,
        spreadsheetId,
        tabTitle,
        config,
        metaByEntity[config.entity],
        parentLinks,
        linkStats
      )
      links.forEach((v, k) =>
        (config.entity === "campaign" ? linked.campaigns : config.entity === "ad_set" ? linked.adSets : linked.ads).set(k, v)
      )
      sheet_cells_updated += linkStats.linked.filter((l) => l.entity === config.entity).length

      const tabStats = await syncTab(sheets, spreadsheetId, tabTitle, config)
      changes.push(...tabStats.changes)
      sheet_cells_updated += tabStats.cellsUpdated
      awaiting_meta_build += tabStats.awaitingMetaBuild

      if (config.entity === "campaign") {
        campaigns_processed = tabStats.processed
        campaigns_skipped = tabStats.skipped
        tabStats.platformIdsInSheet.forEach((id) => platformInSheet.campaigns.add(id))
      } else if (config.entity === "ad_set") {
        ad_sets_processed = tabStats.processed
        ad_sets_skipped = tabStats.skipped
        tabStats.platformIdsInSheet.forEach((id) => platformInSheet.adSets.add(id))
      } else {
        ads_processed = tabStats.processed
        ads_skipped = tabStats.skipped
        tabStats.platformIdsInSheet.forEach((id) => platformInSheet.ads.add(id))
      }
    }

    const unmatchedRows = buildUnmatchedRows(metaCampaigns, metaAdSets, metaAds, platformInSheet, linked)
    if (unmatchedRows.length > 1) {
      let existingUnmatched: string[][] = []
      if (tabTitles.some((t) => t === UNMATCHED_TAB)) {
        existingUnmatched = await readSheetValues(sheets, spreadsheetId, UNMATCHED_TAB)
      }
      if (unmatchedFingerprint(unmatchedRows) !== unmatchedFingerprint(existingUnmatched)) {
        await ensureTabExists(sheets, spreadsheetId, UNMATCHED_TAB)
        await replaceTabValues(sheets, spreadsheetId, UNMATCHED_TAB, unmatchedRows)
        unmatched_written = unmatchedRows.length - 1
      }
    }

    // Builders → Supabase (campaigns / ad_sets). Non-fatal: the sheet work above already landed.
    let db_sync: NamerDbSyncResult | { error: string }
    try {
      db_sync = await syncNamerBuildersToDb(admin, spreadsheetId)
    } catch (e) {
      db_sync = { error: e instanceof Error ? e.message : String(e) }
    }

    if (changes.length) {
      await admin.from("actions_log").insert({
        kind: LOG_KIND,
        executed_by: EXECUTOR,
        payload: {
          run_type: "namer_sync",
          sync_kind: SYNC_KIND,
          event: "status_updates",
          changes,
        },
        success: true,
      })
    }

    if (awaiting_meta_build > 0) {
      await admin.from("actions_log").insert({
        kind: LOG_KIND,
        executed_by: EXECUTOR,
        payload: {
          run_type: "namer_sync",
          sync_kind: SYNC_KIND,
          event: "awaiting_meta_build",
          count: awaiting_meta_build,
        },
        success: true,
      })
    }

    const duration_ms = Date.now() - t0
    const reason =
      linkStats.linked.length === 0 && sheet_cells_updated === 0 && unmatched_written === 0 ? "no_sheet_changes" : undefined

    await admin
      .from("actions_log")
      .update({
        success: true,
        error_message: null,
        payload: {
          run_type: "namer_sync",
          sync_kind: SYNC_KIND,
          campaigns_processed,
          campaigns_skipped,
          ad_sets_processed,
          ad_sets_skipped,
          ads_processed,
          ads_skipped,
          sheet_cells_updated,
          awaiting_meta_build,
          unmatched_written,
          changes_count: changes.length,
          linked: linkStats.linked,
          db_sync,
          duration_ms,
          ...(reason ? { reason } : {}),
        },
      })
      .eq("id", runId)

    return {
      ok: true,
      runId,
      duration_ms,
      campaigns_processed,
      campaigns_skipped,
      ad_sets_processed,
      ad_sets_skipped,
      ads_processed,
      ads_skipped,
      sheet_cells_updated,
      awaiting_meta_build,
      unmatched_written,
      changes,
      linked: linkStats.linked,
      db_sync,
      ...(reason ? { reason } : {}),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await admin
      .from("actions_log")
      .update({
        success: false,
        error_message: msg,
        payload: { run_type: "namer_sync", sync_kind: SYNC_KIND, duration_ms: Date.now() - t0, error: msg },
      })
      .eq("id", runId)

    return {
      ok: false,
      runId,
      error: msg,
      duration_ms: Date.now() - t0,
      campaigns_processed,
      campaigns_skipped,
      ad_sets_processed,
      ad_sets_skipped,
      ads_processed,
      ads_skipped,
      sheet_cells_updated,
      awaiting_meta_build,
      unmatched_written,
      changes,
    }
  }
}
