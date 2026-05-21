/**
 * Namer sync agent — Meta Ads Manager → Google Sheets (one-way).
 *
 * Architecture:
 * - **Source of truth for delivery state:** Meta (`effective_status` on campaigns, ad sets, ads).
 * - **Human taxonomy & naming:** the namer Sheet (Campaign / Ad Set / Ad Builder tabs).
 * - **Join keys:** Platform Camp ID, Platform AdSet ID, Platform Ad ID columns in the Sheet.
 * - **Downstream:** reporting-agent ingests performance; evaluator reads Supabase paid-media tables.
 *   This agent does not write to Meta or Supabase campaign rows — only Sheet Status + audit log.
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
  fetchMeta: (id: string) => Promise<MetaObjectFetchResult>
  listMeta: () => Promise<{ id: string; name?: string; effective_status?: string }[]>
}

const ENTITY_CONFIGS: SheetEntityConfig[] = [
  {
    entity: "campaign",
    tabCandidates: ["Campaign Builder", "② Campaign Builder", "2 Campaign Builder"],
    platformIdHeader: [/platform\s*camp\s*id/i],
    internalIdHeader: [/^campaign\s*id$/i, /^camp\s*id$/i],
    statusHeader: [/^status$/i],
    scaleHintHeader: [/scale/i, /priority/i],
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

function buildUnmatchedRows(
  campaigns: { id: string; name?: string; effective_status?: string }[],
  adSets: { id: string; name?: string; effective_status?: string; campaign_id?: string }[],
  ads: { id: string; name?: string; effective_status?: string; campaign_id?: string; adset_id?: string }[],
  inSheet: { campaigns: Set<string>; adSets: Set<string>; ads: Set<string> }
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
    out.push(["campaign", id, c.name ?? "", c.effective_status ?? "", "", "", "Add row in Campaign Builder manually"])
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
      "Add row in Ad Set Builder manually",
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
      "Add row in Ad Builder manually",
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

    for (const config of ENTITY_CONFIGS) {
      const tabTitle = resolveTabTitle(tabTitles, ...config.tabCandidates)
      if (!tabTitle) {
        console.warn(`[namer-sync] Tab not found for ${config.entity}:`, config.tabCandidates.join(", "))
        continue
      }

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

    const [metaCampaigns, metaAdSets, metaAds] = await Promise.all([
      listMetaCampaigns(),
      listMetaAdSets(),
      listMetaAds(),
    ])
    const unmatchedRows = buildUnmatchedRows(metaCampaigns, metaAdSets, metaAds, platformInSheet)
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
      sheet_cells_updated === 0 && unmatched_written === 0 ? "no_sheet_changes" : undefined

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
