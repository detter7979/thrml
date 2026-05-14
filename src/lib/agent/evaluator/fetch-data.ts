import { createAdminClient } from "@/lib/supabase/admin"
import type { Ad, AdSet, Campaign, Recommendation } from "@/types/paid-media"

import {
  type EvaluatorContext,
  type PerformanceDailyRow,
  type PerformanceMasterRow,
  isoDateUtcDaysAgo,
  ruleKey,
} from "./types"

function parseJsonValue(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null
  if (typeof raw === "object") return raw
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return raw
    }
  }
  return raw
}

function buildRulesIndex(rows: { scope: string; rule_key: string; rule_value: unknown }[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const r of rows) {
    const key = ruleKey(r.scope, r.rule_key)
    out[key] = parseJsonValue(r.rule_value)
  }
  return out
}

export async function fetchEvaluatorContext(): Promise<EvaluatorContext> {
  const admin = createAdminClient()
  const dateMasterFrom = isoDateUtcDaysAgo(30)
  const dateDailyFrom = isoDateUtcDaysAgo(14)
  const recsSince = new Date(Date.now() - 72 * 3600 * 1000).toISOString()
  const actionsSince = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  const { data: campaigns, error: cErr } = await admin
    .from("campaigns")
    .select("*")
    .in("status", ["TEST", "SCALE"])

  if (cErr) throw new Error(`campaigns: ${cErr.message}`)
  const campList = (campaigns ?? []) as Campaign[]
  const campaignIds = campList.map((c) => c.id)
  if (campaignIds.length === 0) {
    const [{ data: rulesRows }, { data: recentRecs }, { data: budgetActs }] = await Promise.all([
      admin.from("rules_config").select("scope, rule_key, rule_value").eq("active", true),
      admin.from("recommendations").select("*").gte("created_at", recsSince),
      admin
        .from("actions_log")
        .select("target_campaign_id")
        .eq("kind", "ADJUST_BUDGET")
        .gte("executed_at", actionsSince)
        .not("target_campaign_id", "is", null),
    ])
    const bumpSet = new Set<string>()
    for (const r of budgetActs ?? []) {
      const id = (r as { target_campaign_id: string | null }).target_campaign_id
      if (id) bumpSet.add(id)
    }
    return {
      campaigns: [],
      adSets: [],
      ads: [],
      performance: [],
      performanceDaily: [],
      rules: buildRulesIndex(rulesRows ?? []),
      recentRecs: (recentRecs ?? []) as Recommendation[],
      campaignsWithRecentBudgetAction: bumpSet,
    }
  }

  const [
    { data: adSets, error: sErr },
    { data: ads, error: aErr },
    { data: rulesRows, error: rErr },
    { data: recentRecs, error: recErr },
    { data: budgetActs },
  ] = await Promise.all([
    admin.from("ad_sets").select("*").in("campaign_id", campaignIds),
    admin.from("ads").select("*").in("campaign_id", campaignIds),
    admin.from("rules_config").select("scope, rule_key, rule_value").eq("active", true),
    admin.from("recommendations").select("*").gte("created_at", recsSince),
    admin
      .from("actions_log")
      .select("target_campaign_id")
      .eq("kind", "ADJUST_BUDGET")
      .gte("executed_at", actionsSince)
      .not("target_campaign_id", "is", null),
  ])

  if (sErr) throw new Error(`ad_sets: ${sErr.message}`)
  if (aErr) throw new Error(`ads: ${aErr.message}`)
  if (rErr) throw new Error(`rules_config: ${rErr.message}`)
  if (recErr) throw new Error(`recommendations: ${recErr.message}`)

  const { data: perf, error: pErr } = await admin
    .from("performance_master")
    .select("*")
    .in("campaign_id", campaignIds)
    .gte("date", dateMasterFrom)

  if (pErr) throw new Error(`performance_master: ${pErr.message}`)

  const entityIds = new Set<string>()
  for (const c of campaignIds) entityIds.add(c)
  for (const s of adSets ?? []) entityIds.add((s as AdSet).id)
  for (const a of ads ?? []) entityIds.add((a as Ad).id)

  const idList = [...entityIds]
  const { data: daily, error: dErr } = await admin
    .from("performance_daily")
    .select("*")
    .gte("date", dateDailyFrom)
    .in("entity_id", idList)

  if (dErr) throw new Error(`performance_daily: ${dErr.message}`)

  const bumpSet = new Set<string>()
  for (const r of budgetActs ?? []) {
    const id = (r as { target_campaign_id: string | null }).target_campaign_id
    if (id) bumpSet.add(id)
  }

  return {
    campaigns: campList,
    adSets: (adSets ?? []) as AdSet[],
    ads: (ads ?? []) as Ad[],
    performance: (perf ?? []) as PerformanceMasterRow[],
    performanceDaily: (daily ?? []) as PerformanceDailyRow[],
    rules: buildRulesIndex(rulesRows ?? []),
    recentRecs: (recentRecs ?? []) as Recommendation[],
    campaignsWithRecentBudgetAction: bumpSet,
  }
}
