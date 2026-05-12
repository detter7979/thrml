import type { SupabaseClient } from "@supabase/supabase-js"

import { utcDatesInclusive } from "@/lib/dates/utc-yesterday"
import {
  fetchActiveCampaigns,
  fetchInsights,
  getMetaAdAccountId,
  mapMetaActionsToEvents,
  purchaseRevenueUsd,
  type MetaInsightRow,
} from "@/lib/agent/meta-ads-api"

const LOG_KIND = "AGENT_RUN" as const
const EXECUTOR = "REPORTING_AGENT" as const

export type ReportingIngestOptions = {
  dateStart: string
  dateEnd: string
  /** When true, skip partial-resume heuristics (manual backfill). */
  freshRun?: boolean
}

export type ReportingIngestResult = {
  ok: boolean
  runId: string | null
  error?: string
  partial?: boolean
  last_campaign_processed?: string | null
  resume_token?: string | null
  rows_ingested: number
  campaigns_processed: number
  ad_sets_processed: number
  ads_processed: number
  duration_ms: number
}

type CampaignRow = {
  id: string
  legacy_id: string | null
  platform_campaign_id: string | null
  event: string
  launch_week: string
}

type DailyInsert = {
  date: string
  level: "campaign" | "ad_set" | "ad"
  entity_id: string
  platform_entity_id: string | null
  impressions: number | null
  reach: number | null
  clicks: number | null
  link_clicks: number | null
  spend_usd: number | null
  cpm: number | null
  cpc: number | null
  ctr: number | null
  frequency: number | null
  conversions: number | null
  conv_event: string | null
  cost_per_conv: number | null
  revenue_usd: number | null
  raw_payload: Record<string, unknown> | null
}

async function findResumeAfterCampaignId(
  admin: SupabaseClient,
  dateStart: string
): Promise<string | null> {
  const { data: logs } = await admin
    .from("actions_log")
    .select("success, payload, executed_at")
    .eq("executed_by", EXECUTOR)
    .in("kind", ["AGENT_RUN", "SYSTEM"])
    .order("executed_at", { ascending: false })
    .limit(40)

  for (const row of logs ?? []) {
    const p = row.payload as Record<string, unknown> | null
    if (!p || p.run_type !== "daily_ingest" || p.dateStart !== dateStart) continue
    if (!row.success) continue
    if (p.partial !== true) return null
    if (typeof p.resume_token === "string") return p.resume_token
  }
  return null
}

function insightToDailyRows(
  insight: MetaInsightRow,
  dbLevel: "campaign" | "ad_set" | "ad",
  entityUuid: string,
  campaignEventFallback: string
): DailyInsert[] {
  const d = insight.date
  const mapped = mapMetaActionsToEvents(insight.actions)
  const revenuePur = purchaseRevenueUsd(insight.action_values)
  const spend = insight.spend_usd
  const baseMetrics = {
    impressions: insight.impressions,
    reach: insight.reach,
    clicks: insight.clicks,
    link_clicks: insight.link_clicks,
    spend_usd: spend,
    cpm: insight.cpm,
    cpc: insight.cpc,
    ctr: insight.ctr,
    frequency: insight.frequency,
  }

  const mk = (
    conv: string | null,
    conversions: number,
    carrySpend: boolean,
    revenue_usd: number | null
  ): DailyInsert => {
    const convN = conversions
    const cost_per_conv = carrySpend && convN > 0 && spend > 0 ? spend / convN : null
    return {
      date: d,
      level: dbLevel,
      entity_id: entityUuid,
      platform_entity_id: insight.platform_entity_id || null,
      impressions: carrySpend ? baseMetrics.impressions : null,
      reach: carrySpend ? baseMetrics.reach : null,
      clicks: carrySpend ? baseMetrics.clicks : null,
      link_clicks: carrySpend ? baseMetrics.link_clicks : null,
      spend_usd: carrySpend ? spend : 0,
      cpm: carrySpend ? baseMetrics.cpm : null,
      cpc: carrySpend ? baseMetrics.cpc : null,
      ctr: carrySpend ? baseMetrics.ctr : null,
      frequency: carrySpend ? baseMetrics.frequency : null,
      conversions: convN,
      conv_event: conv,
      cost_per_conv,
      revenue_usd,
      raw_payload: insight.raw_payload,
    }
  }

  if (mapped.length === 0) {
    return [mk(campaignEventFallback, 0, true, null)]
  }

  const out: DailyInsert[] = []
  let first = true
  for (const { event_t, conversions } of mapped) {
    if (conversions <= 0) continue
    const rev = event_t === "PUR" ? revenuePur : null
    out.push(mk(event_t, conversions, first, rev))
    first = false
  }
  if (out.length === 0) {
    return [mk(campaignEventFallback, 0, true, null)]
  }
  return out
}

async function insertDailyBatched(admin: SupabaseClient, rows: DailyInsert[]) {
  const chunk = 80
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk)
    const { error } = await admin.from("performance_daily").upsert(slice, {
      onConflict: "date,level,entity_id,conv_event",
      ignoreDuplicates: true,
    })
    if (error) throw new Error(`performance_daily upsert: ${error.message}`)
  }
}

type CampMeta = {
  platform: string
  persona: string
  service: string
  geo: string
  phase: string
  funnel: string
  launch_week: string
}

async function refreshPerformanceMaster(admin: SupabaseClient, date: string) {
  const { error: delErr } = await admin.from("performance_master").delete().eq("date", date)
  if (delErr) throw new Error(`performance_master delete: ${delErr.message}`)

  const { data: daily, error: dErr } = await admin.from("performance_daily").select("*").eq("date", date)
  if (dErr) throw new Error(`performance_daily select: ${dErr.message}`)

  const campaignIds = new Set<string>()
  const adSetIds = new Set<string>()
  const adIds = new Set<string>()
  for (const r of daily ?? []) {
    if (r.level === "campaign") campaignIds.add(r.entity_id as string)
    else if (r.level === "ad_set") adSetIds.add(r.entity_id as string)
    else if (r.level === "ad") adIds.add(r.entity_id as string)
  }

  const [{ data: camps }, { data: sets }, { data: ads }] = await Promise.all([
    campaignIds.size
      ? admin.from("campaigns").select("id,platform,persona,service,geo,phase,funnel,launch_week").in("id", [...campaignIds])
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    adSetIds.size
      ? admin.from("ad_sets").select("id,campaign_id").in("id", [...adSetIds])
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    adIds.size
      ? admin.from("ads").select("id,ad_set_id,campaign_id").in("id", [...adIds])
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  const campMap = new Map<string, CampMeta>()
  for (const c of camps ?? []) {
    campMap.set(c.id as string, {
      platform: String(c.platform),
      persona: String(c.persona),
      service: String(c.service),
      geo: String(c.geo),
      phase: String(c.phase),
      funnel: String(c.funnel),
      launch_week: String(c.launch_week),
    })
  }
  const setToCamp = new Map<string, string>()
  for (const s of sets ?? []) setToCamp.set(s.id as string, s.campaign_id as string)
  const adToSets = new Map<string, { ad_set_id: string; campaign_id: string }>()
  for (const a of ads ?? []) adToSets.set(a.id as string, { ad_set_id: a.ad_set_id as string, campaign_id: a.campaign_id as string })

  const masterRows: Record<string, unknown>[] = []

  for (const r of daily ?? []) {
    const level = r.level as string
    let campaign_id: string
    let ad_set_id: string | null = null
    let ad_id: string | null = null

    if (level === "campaign") {
      campaign_id = r.entity_id as string
    } else if (level === "ad_set") {
      ad_set_id = r.entity_id as string
      const cid = setToCamp.get(ad_set_id)
      if (!cid) continue
      campaign_id = cid
    } else if (level === "ad") {
      ad_id = r.entity_id as string
      const link = adToSets.get(ad_id)
      if (!link) continue
      campaign_id = link.campaign_id
      ad_set_id = link.ad_set_id
    } else continue

    const cmeta = campMap.get(campaign_id)
    if (!cmeta) continue

    const spend = r.spend_usd != null ? Number(r.spend_usd) : 0
    const conv = r.conversions != null ? Number(r.conversions) : 0
    const convEvent = (r.conv_event as string) ?? null

    const signup_count = convEvent === "BH" ? conv : 0
    const onboard_count = convEvent === "HO" ? conv : 0
    const listing_count = convEvent === "NL" ? conv : 0
    const activation_count = convEvent === "ACT" ? conv : 0

    const cac_signup = signup_count > 0 && spend > 0 ? spend / signup_count : null
    const cac_activation = activation_count > 0 && spend > 0 ? spend / activation_count : null

    const cost_per_conv =
      conv > 0 && spend > 0 ? spend / conv : r.cost_per_conv != null ? Number(r.cost_per_conv) : null

    masterRows.push({
      date,
      campaign_id,
      ad_set_id,
      ad_id,
      level,
      platform: cmeta.platform,
      persona: cmeta.persona,
      service: cmeta.service,
      geo: cmeta.geo,
      phase: cmeta.phase,
      funnel: cmeta.funnel,
      conv_event: convEvent,
      launch_week: cmeta.launch_week,
      impressions: r.impressions != null ? Number(r.impressions) : null,
      clicks: r.clicks != null ? Number(r.clicks) : null,
      link_clicks: r.link_clicks != null ? Number(r.link_clicks) : null,
      spend_usd: spend,
      cpm: r.cpm != null ? Number(r.cpm) : null,
      cpc: r.cpc != null ? Number(r.cpc) : null,
      ctr: r.ctr != null ? Number(r.ctr) : null,
      conversions: conv,
      cost_per_conv,
      revenue_usd: r.revenue_usd != null ? Number(r.revenue_usd) : null,
      signup_count,
      onboard_count,
      listing_count,
      activation_count,
      cac_signup,
      cac_activation,
      payback_days: null,
      cohort_week: cmeta.launch_week,
      refreshed_at: new Date().toISOString(),
    })
  }

  for (let i = 0; i < masterRows.length; i += 80) {
    const slice = masterRows.slice(i, i + 80)
    const { error } = await admin.from("performance_master").insert(slice)
    if (error) throw new Error(`performance_master insert: ${error.message}`)
  }
}

export async function runReportingIngest(
  admin: SupabaseClient,
  options: ReportingIngestOptions
): Promise<ReportingIngestResult> {
  const t0 = Date.now()
  let rows_ingested = 0
  let campaigns_processed = 0
  let ad_sets_processed = 0
  let ads_processed = 0
  const { dateStart, dateEnd, freshRun } = options

  const { data: runInsert, error: runErr } = await admin
    .from("actions_log")
    .insert({
      kind: LOG_KIND,
      executed_by: EXECUTOR,
      payload: {
        run_type: "daily_ingest",
        dateStart,
        dateEnd,
        reporting_agent: true,
      },
      success: false,
    })
    .select("id")
    .single()

  if (runErr || !runInsert?.id) {
    return {
      ok: false,
      runId: null,
      error: runErr?.message ?? "Failed to create actions_log run",
      rows_ingested: 0,
      campaigns_processed: 0,
      ad_sets_processed: 0,
      ads_processed: 0,
      duration_ms: Date.now() - t0,
    }
  }

  const runId = runInsert.id as string

  try {
    const metaActive = await fetchActiveCampaigns(getMetaAdAccountId())
    const metaActiveIds = new Set(metaActive.map((c) => c.id))

    const resumeId = freshRun ? null : await findResumeAfterCampaignId(admin, dateStart)

    const { data: campaigns, error: cErr } = await admin
      .from("campaigns")
      .select("id, legacy_id, platform_campaign_id, event, launch_week")
      .eq("platform", "META")
      .in("status", ["TEST", "SCALE"])
      .not("platform_campaign_id", "is", null)

    if (cErr) throw new Error(cErr.message)

    const list = (campaigns ?? []) as CampaignRow[]
    let startIdx = 0
    if (resumeId) {
      const ix = list.findIndex((c) => c.id === resumeId)
      startIdx = ix >= 0 ? ix + 1 : 0
    }

    const dailyBuffer: DailyInsert[] = []
    let partial = false
    let lastLegacy: string | null = null
    let resume_token: string | null = null
    let dailyRowsWritten = 0

    for (let i = startIdx; i < list.length; i++) {
      const camp = list[i]
      if (!camp.platform_campaign_id) continue

      if (metaActiveIds.size > 0 && !metaActiveIds.has(camp.platform_campaign_id)) {
        console.warn(
          `[reporting-agent] Supabase campaign ${camp.legacy_id} platform_campaign_id ${camp.platform_campaign_id} not in Meta ACTIVE set`
        )
      }

      const { data: adSets } = await admin
        .from("ad_sets")
        .select("id, platform_adset_id")
        .eq("campaign_id", camp.id)
        .in("status", ["TEST", "SCALE"])
        .not("platform_adset_id", "is", null)

      const { data: ads } = await admin
        .from("ads")
        .select("id, platform_ad_id")
        .eq("campaign_id", camp.id)
        .in("status", ["TEST", "SCALE"])
        .not("platform_ad_id", "is", null)

      const setRows = adSets ?? []
      const adRows = ads ?? []

      const campInsights = await fetchInsights("campaign", [camp.platform_campaign_id], dateStart, dateEnd)
      for (const ins of campInsights.filter((x) => x.date >= dateStart && x.date <= dateEnd)) {
        const chunk = insightToDailyRows(ins, "campaign", camp.id, camp.event)
        dailyBuffer.push(...chunk)
        dailyRowsWritten += chunk.length
      }

      const setIds = setRows.map((s) => s.platform_adset_id).filter(Boolean) as string[]
      if (setIds.length) {
        const setInsights = await fetchInsights("adset", setIds, dateStart, dateEnd)
        for (const ins of setInsights.filter((x) => x.date >= dateStart && x.date <= dateEnd)) {
          const row = setRows.find((s) => s.platform_adset_id === ins.platform_entity_id)
          if (row) {
            const chunk = insightToDailyRows(ins, "ad_set", row.id, camp.event)
            dailyBuffer.push(...chunk)
            dailyRowsWritten += chunk.length
          }
        }
      }

      const adIds = adRows.map((a) => a.platform_ad_id).filter(Boolean) as string[]
      if (adIds.length) {
        const adInsights = await fetchInsights("ad", adIds, dateStart, dateEnd)
        for (const ins of adInsights.filter((x) => x.date >= dateStart && x.date <= dateEnd)) {
          const row = adRows.find((a) => a.platform_ad_id === ins.platform_entity_id)
          if (row) {
            const chunk = insightToDailyRows(ins, "ad", row.id, camp.event)
            dailyBuffer.push(...chunk)
            dailyRowsWritten += chunk.length
          }
        }
      }

      if (dailyBuffer.length >= 200) {
        await insertDailyBatched(admin, dailyBuffer.splice(0, dailyBuffer.length))
      }

      campaigns_processed += 1
      ad_sets_processed += setIds.length
      ads_processed += adIds.length

      const campSpend = campInsights
        .filter((x) => x.date >= dateStart && x.date <= dateEnd)
        .reduce((s, x) => s + x.spend_usd, 0)
      if (campSpend <= 0) {
        await admin.from("actions_log").insert({
          kind: LOG_KIND,
          executed_by: EXECUTOR,
          payload: {
            event: "zero_spend_warning",
            campaign_legacy_id: camp.legacy_id ?? camp.id,
            platform_campaign_id: camp.platform_campaign_id,
            dateStart,
          },
          success: true,
          error_message: `Zero spend detected on active campaign ${camp.legacy_id ?? camp.id}`,
        })
      }

      lastLegacy = camp.legacy_id
      resume_token = camp.id

      if (Date.now() - t0 > 50_000 && i + 1 < list.length) {
        partial = true
        break
      }
    }

    rows_ingested = dailyRowsWritten

    if (dailyBuffer.length) await insertDailyBatched(admin, dailyBuffer)

    if (!partial) {
      for (const d of utcDatesInclusive(dateStart, dateEnd)) {
        await refreshPerformanceMaster(admin, d)
      }
    }

    const duration_ms = Date.now() - t0
    await admin
      .from("actions_log")
      .update({
        success: true,
        payload: {
          run_type: "daily_ingest",
          dateStart,
          dateEnd,
          reporting_agent: true,
          rows_ingested,
          campaigns_processed,
          ad_sets_processed,
          ads_processed,
          duration_ms,
          partial,
          last_campaign_processed: partial ? lastLegacy : null,
          resume_token: partial ? resume_token : null,
        },
        error_message: null,
      })
      .eq("id", runId)

    return {
      ok: true,
      runId,
      partial,
      last_campaign_processed: partial ? lastLegacy : null,
      resume_token: partial ? resume_token : null,
      rows_ingested,
      campaigns_processed,
      ad_sets_processed,
      ads_processed,
      duration_ms,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await admin
      .from("actions_log")
      .update({
        success: false,
        error_message: msg,
        payload: {
          run_type: "daily_ingest",
          dateStart,
          dateEnd,
          reporting_agent: true,
          rows_ingested,
          campaigns_processed,
          ad_sets_processed,
          ads_processed,
          duration_ms: Date.now() - t0,
        },
      })
      .eq("id", runId)

    return {
      ok: false,
      runId,
      error: msg,
      rows_ingested,
      campaigns_processed,
      ad_sets_processed,
      ads_processed,
      duration_ms: Date.now() - t0,
    }
  }
}

export { utcYesterdayRange, utcDatesInclusive } from "@/lib/dates/utc-yesterday"
