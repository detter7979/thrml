/**
 * Test scenario: 45 days of synthetic performance on the real namer campaigns, run through the
 * evaluator in memory and written to the TEST report (Drive Test folder + is_test report rows).
 *
 * Nothing touches the real performance tables or Meta. Recommendations are only written when you
 * ask ("send to Approvals"); they're tagged is_test, approving them never builds or executes
 * anything, and "Clear test data" removes them.
 *
 * Built-in situations (on whichever campaigns exist):
 *   host P1 campaign #1  · ad set 1 wins (cheap BH), ad set 2 burns spend with no BH, ad set 3 fatigues
 *                         (frequency > cap); volume clears the P1 → P2 bar
 *   host P1 campaign #2  · cost per BH ~3× target (pause / kill)
 *   guest campaigns      · one ad's CTR drops ~40% in the last 7 days (creative refresh); purchases
 *                         with revenue for ROAS
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { buildRulesIndex } from "@/lib/agent/evaluator/fetch-data"
import { proposeFromContext } from "@/lib/agent/evaluator"
import type { EvaluatorContext, PerformanceDailyRow, PerformanceMasterRow, RuleResult } from "@/lib/agent/evaluator/types"
import type { Ad, AdSet, Campaign } from "@/types/paid-media"

import { runUnifiedReport, type ReportRunResult } from "./run-report"
import { type Ga4DailyRow, type PlatformDailyRow, datesBetween, utcDaysAgo } from "./unified"

type Fact = {
  date: string
  campaign: Campaign
  set: AdSet
  ad: Ad
  spend: number
  impressions: number
  reach: number
  clicks: number
  link_clicks: number
  frequency: number
  conv: Record<string, number>
  revenue: number
}

export type ScenarioResult = {
  campaigns: string[]
  days: number
  spend: number
  proposals: (RuleResult & { campaign?: string; ad_set?: string; ad?: string })[]
  rawProposals: number
  report: ReportRunResult | null
  sentToApprovals: number
}

/** Small deterministic PRNG so a scenario run is repeatable. */
function rng(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const PLAT: Record<string, "meta" | "google"> = { META: "meta", GOOG: "google" }

function pid(real: string | null | undefined, legacy: string | null) {
  return real && real.trim() ? real : `TEST_${legacy ?? "X"}`
}

function generateFacts(campaigns: Campaign[], sets: AdSet[], ads: Ad[], from: string, to: string): Fact[] {
  const rand = rng(46)
  const days = datesBetween(from, to)
  const facts: Fact[] = []
  const hostP1 = campaigns.filter((c) => c.persona === "host" && c.phase === "P1")
  const winnerCampaign = hostP1.find((c) => sets.filter((s) => s.campaign_id === c.id).length >= 2) ?? hostP1[0]
  const expensiveCampaign = hostP1.find((c) => c.id !== winnerCampaign?.id)
  let declinedOne = false

  for (const c of campaigns) {
    const cSets = sets.filter((s) => s.campaign_id === c.id)
    const cAds = ads.filter((a) => a.campaign_id === c.id)
    if (!cAds.length) continue
    const budget = Number(c.daily_budget_usd) || 20
    const isHost = c.persona === "host"
    const declineAd = !isHost && !declinedOne && cAds.length >= 2 ? cAds[0] : null
    if (declineAd) declinedOne = true

    cSets.forEach((set, si) => {
      const setAds = cAds.filter((a) => a.ad_set_id === set.id)
      if (!setAds.length) return
      const role =
        c.id === winnerCampaign?.id ? (["winner", "burner", "fatigue"][si] ?? "steady") : c.id === expensiveCampaign?.id ? "expensive" : "steady"
      const setShare = 1 / cSets.length
      days.forEach((date, di) => {
        const recent = di >= days.length - 7
        const setFreq = role === "fatigue" && recent ? 3.4 + rand() * 0.6 : 1.15 + rand() * 0.35
        for (const ad of setAds) {
          const spend = Math.round(budget * setShare * (1 / setAds.length) * (0.85 + rand() * 0.3) * 100) / 100
          const cpm = (isHost ? 14 : 11) * (0.85 + rand() * 0.3)
          const impressions = Math.round((spend / cpm) * 1000)
          let ctr = (isHost ? 0.011 : 0.014) * (0.8 + rand() * 0.4)
          if (role === "winner") ctr *= 1.5
          if (role === "fatigue" && recent) ctr *= 0.7
          if (declineAd && ad.id === declineAd.id && recent) ctr *= 0.55
          const clicks = Math.max(0, Math.round(impressions * ctr))
          const link = Math.round(clicks * 0.82)
          const conv: Record<string, number> = {}
          let revenue = 0
          if (isHost) {
            const bhRate = role === "winner" ? 0.5 : role === "burner" ? 0 : role === "expensive" ? 0.05 : 0.18
            const bh = Math.round(link * bhRate * (0.8 + rand() * 0.4))
            conv.BH = bh
            conv.HO = Math.round(bh * 0.25 * (0.6 + rand() * 0.8))
            conv.NL = Math.round(conv.HO * 0.3 * (0.5 + rand()))
          } else {
            conv.VC = Math.round(link * 0.62 * (0.85 + rand() * 0.3))
            conv.IC = Math.round(conv.VC * 0.09 * (0.6 + rand() * 0.8))
            conv.PUR = rand() < conv.IC * 0.35 ? 1 : 0
            revenue = conv.PUR * Math.round(65 + rand() * 60)
          }
          facts.push({
            date,
            campaign: c,
            set,
            ad,
            spend,
            impressions,
            reach: Math.round(impressions / setFreq),
            clicks,
            link_clicks: link,
            frequency: Math.round(setFreq * 100) / 100,
            conv,
            revenue,
          })
        }
      })
    })
  }
  return facts
}

function toReportRows(facts: Fact[]): { platform: PlatformDailyRow[]; ga4: Ga4DailyRow[] } {
  const platform: PlatformDailyRow[] = []
  const ga4: Ga4DailyRow[] = []
  const rand = rng(7)
  for (const f of facts) {
    const plat = PLAT[f.campaign.platform] ?? "meta"
    const adId = pid(f.ad.platform_ad_id, f.ad.legacy_id)
    const setId = pid(f.set.platform_adset_id, f.set.legacy_id)
    const campId = pid(f.campaign.platform_campaign_id, f.campaign.legacy_id)
    platform.push({
      date: f.date,
      platform: plat,
      ad_id: adId,
      adset_id: setId,
      campaign_id: campId,
      ad_name: f.ad.name,
      adset_name: f.set.name,
      campaign_name: f.campaign.name,
      spend: f.spend,
      impressions: f.impressions,
      reach: f.reach,
      clicks: f.clicks,
      link_clicks: f.link_clicks,
      conversions: f.conv,
      revenue: f.revenue,
    })
    const sessions = Math.round(f.link_clicks * (0.78 + rand() * 0.15))
    const events: Record<string, number> = {}
    if (f.campaign.persona === "host") {
      events.become_host_click = Math.round((f.conv.BH ?? 0) * 0.92)
      events.host_onboarding_started = f.conv.HO ?? 0
      events.host_first_listing_created = f.conv.NL ?? 0
    } else {
      events.view_item = Math.round((f.conv.VC ?? 0) * 0.95)
      events.begin_checkout = f.conv.IC ?? 0
      events.purchase = f.conv.PUR ?? 0
    }
    ga4.push({
      date: f.date,
      source: plat === "meta" ? "meta" : "google",
      medium: plat === "meta" ? "paid_social" : "cpc",
      campaign: f.campaign.name,
      utm_id: campId,
      term: setId,
      content: adId,
      sessions,
      engaged_sessions: Math.round(sessions * (0.55 + rand() * 0.2)),
      events,
      revenue: f.revenue,
    })
  }
  return { platform, ga4 }
}

/** Evaluator rows in the same shape the ingest writes (one row per entity × day × event; spend on the first). */
function toEvaluatorRows(facts: Fact[]): { daily: PerformanceDailyRow[]; master: PerformanceMasterRow[] } {
  type Agg = { spend: number; impressions: number; reach: number; clicks: number; link: number; freq: number[]; conv: Record<string, number>; revenue: number }
  const levels = new Map<string, { level: "campaign" | "ad_set" | "ad"; f: Fact; agg: Agg; entity: string }>()
  const add = (level: "campaign" | "ad_set" | "ad", entity: string, f: Fact) => {
    const k = `${level}|${entity}|${f.date}`
    let cur = levels.get(k)
    if (!cur) {
      cur = { level, f, entity, agg: { spend: 0, impressions: 0, reach: 0, clicks: 0, link: 0, freq: [], conv: {}, revenue: 0 } }
      levels.set(k, cur)
    }
    const a = cur.agg
    a.spend += f.spend
    a.impressions += f.impressions
    a.reach += f.reach
    a.clicks += f.clicks
    a.link += f.link_clicks
    a.freq.push(f.frequency)
    a.revenue += f.revenue
    for (const [e, n] of Object.entries(f.conv)) a.conv[e] = (a.conv[e] ?? 0) + n
  }
  for (const f of facts) {
    add("campaign", f.campaign.id, f)
    add("ad_set", f.set.id, f)
    add("ad", f.ad.id, f)
  }

  const daily: PerformanceDailyRow[] = []
  const master: PerformanceMasterRow[] = []
  let id = 1
  const now = new Date().toISOString()
  for (const { level, f, agg, entity } of levels.values()) {
    const events = Object.entries(agg.conv)
    const list = events.length ? events : [[f.campaign.event, 0] as [string, number]]
    list.forEach(([ev, n], i) => {
      const first = i === 0
      const freq = agg.freq.reduce((s, x) => s + x, 0) / agg.freq.length
      const base = {
        id: id++,
        date: f.date,
        impressions: first ? agg.impressions : 0,
        clicks: first ? agg.clicks : 0,
        link_clicks: first ? agg.link : 0,
        spend_usd: first ? Math.round(agg.spend * 100) / 100 : 0,
        cpm: null,
        cpc: null,
        ctr: first && agg.impressions ? agg.clicks / agg.impressions : null,
        conversions: n,
        conv_event: ev,
        cost_per_conv: null,
        revenue_usd: ev === "PUR" ? agg.revenue : null,
      }
      daily.push({
        ...base,
        level,
        entity_id: entity,
        platform_entity_id: null,
        reach: first ? agg.reach : 0,
        frequency: first ? Math.round(freq * 100) / 100 : null,
        ingested_at: now,
      })
      master.push({
        ...base,
        level,
        campaign_id: f.campaign.id,
        ad_set_id: level === "campaign" ? null : f.set.id,
        ad_id: level === "ad" ? f.ad.id : null,
        platform: f.campaign.platform,
        persona: f.campaign.persona,
        service: f.campaign.service,
        geo: f.campaign.geo,
        phase: f.campaign.phase,
        funnel: f.campaign.funnel,
        launch_week: "",
        signup_count: ev === "BH" ? n : null,
        onboard_count: ev === "HO" ? n : null,
        listing_count: ev === "NL" ? n : null,
        activation_count: ev === "ACT" ? n : null,
        cac_signup: null,
        cac_activation: null,
        payback_days: null,
        cohort_week: null,
        refreshed_at: now,
      })
    })
  }
  return { daily, master }
}

async function replaceTestRows<T extends object>(admin: SupabaseClient, table: string, rows: T[]) {
  const { error } = await admin.from(table).delete().eq("is_test", true)
  if (error) throw new Error(`${table}: ${error.message}`)
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e } = await admin.from(table).upsert(rows.slice(i, i + 500).map((r) => ({ ...r, is_test: true })))
    if (e) throw new Error(`${table}: ${e.message}`)
  }
}

export async function runTestScenario(
  admin: SupabaseClient,
  opts: { sendToApprovals?: boolean; writeReport?: boolean } = {}
): Promise<ScenarioResult> {
  const from = utcDaysAgo(45)
  const to = utcDaysAgo(1)

  const [{ data: campaigns }, { data: sets }, { data: ads }, { data: rulesRows }] = await Promise.all([
    admin.from("campaigns").select("*").in("platform", ["META", "GOOG"]).not("status", "in", "(KILLED,ARCHIVED)"),
    admin.from("ad_sets").select("*").not("status", "in", "(KILLED,ARCHIVED)"),
    admin.from("ads").select("*").not("status", "in", "(KILLED,ARCHIVED)"),
    admin.from("rules_config").select("scope, rule_key, rule_value").eq("active", true),
  ])
  const allCampaigns = (campaigns ?? []) as Campaign[]
  const allSets = (sets ?? []) as AdSet[]
  const allAds = (ads ?? []) as Ad[]
  const withAds = allCampaigns.filter((c) => allAds.some((a) => a.campaign_id === c.id))

  const facts = generateFacts(withAds, allSets, allAds, from, to)
  const { platform, ga4 } = toReportRows(facts)
  await replaceTestRows(admin, "report_platform_daily", platform)
  await replaceTestRows(admin, "report_ga4_daily", ga4)

  // Evaluator in memory: scenario campaigns treated as live so every rule looks at them.
  const live = new Set(withAds.map((c) => c.id))
  const asLive = <T extends { status: string }>(x: T): T => ({ ...x, status: "TEST" })
  const ctxCampaigns = withAds.map(asLive)
  const ctxSets = allSets
    .filter((s) => live.has(s.campaign_id))
    .map((s) => ({ ...asLive(s), platform_adset_id: pid(s.platform_adset_id, s.legacy_id) }))
  const ctxAds = allAds.filter((a) => live.has(a.campaign_id)).map(asLive)
  const { daily, master } = toEvaluatorRows(facts)
  const personaOf = new Map(allCampaigns.map((c) => [c.id, c.persona as string]))
  const ctx: EvaluatorContext = {
    campaigns: ctxCampaigns,
    adSets: ctxSets,
    ads: ctxAds,
    performance: master,
    performanceDaily: daily,
    rules: buildRulesIndex(rulesRows ?? []),
    recentRecs: [],
    campaignsWithRecentBudgetAction: new Set(),
    audiencePool: allSets
      .filter((s) => personaOf.has(s.campaign_id))
      .map((s) => ({
        id: s.id,
        legacy_id: s.legacy_id,
        campaign_id: s.campaign_id,
        audience_src: s.audience_src,
        placement: s.placement,
        persona: personaOf.get(s.campaign_id) ?? "",
      })),
  }
  const { raw, proposals } = proposeFromContext(ctx)

  const cName = new Map(allCampaigns.map((c) => [c.id, c.legacy_id ?? c.name]))
  const sName = new Map(allSets.map((s) => [s.id, s.legacy_id ?? s.name]))
  const aName = new Map(allAds.map((a) => [a.id, a.legacy_id ?? a.name]))
  const labelled = proposals.map((p) => ({
    ...p,
    campaign: p.target.campaignId ? cName.get(p.target.campaignId) : undefined,
    ad_set: p.target.adSetId ? sName.get(p.target.adSetId) : undefined,
    ad: p.target.adId ? aName.get(p.target.adId) : undefined,
  }))

  let sent = 0
  if (opts.sendToApprovals && proposals.length) {
    await clearTestRecommendations(admin)
    const expires = new Date(Date.now() + 72 * 3_600_000).toISOString()
    const rows = proposals.map((p) => ({
      kind: p.kind,
      status: "PENDING",
      proposed_by: "EVALUATOR_AGENT",
      target_campaign_id: p.target.campaignId ?? null,
      target_ad_set_id: p.target.adSetId ?? null,
      target_ad_id: p.target.adId ?? null,
      payload: { ...p.payload, is_test: true },
      evidence: { ...p.evidence, test_scenario: true },
      rationale: `[TEST] ${p.rationale}`,
      confidence: Math.round(Math.min(1, Math.max(0, p.confidence)) * 100) / 100,
      auto_approve_eligible: false,
      expires_at: expires,
    }))
    const { error } = await admin.from("recommendations").insert(rows)
    if (error) throw new Error(`recommendations: ${error.message}`)
    sent = rows.length
  }

  const report = opts.writeReport === false ? null : await runUnifiedReport(admin, { test: true })

  return {
    campaigns: withAds.map((c) => c.legacy_id ?? c.name),
    days: datesBetween(from, to).length,
    spend: Math.round(facts.reduce((s, f) => s + f.spend, 0) * 100) / 100,
    proposals: labelled,
    rawProposals: raw.length,
    report,
    sentToApprovals: sent,
  }
}

export async function clearTestRecommendations(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin.from("recommendations").delete().eq("payload->>is_test", "true").select("id")
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

export async function clearTestData(admin: SupabaseClient): Promise<{ recommendations: number }> {
  await admin.from("report_platform_daily").delete().eq("is_test", true)
  await admin.from("report_ga4_daily").delete().eq("is_test", true)
  return { recommendations: await clearTestRecommendations(admin) }
}
