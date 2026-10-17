import type { EvaluatorContext, RuleResult } from "../types"
import { isoDateUtcDaysAgo, ruleNumber } from "../types"

import { resultEvent, targetCacUsd } from "./_cac-helpers"

/**
 * Rule 10 — recommend an audience test (CREATE_AD_SET).
 *
 * When a campaign has a clear winning ad set (enough results, at or under target cost per result)
 * and room for another ad set, propose copying that ad set — same ads, same optimization — with the
 * targeting of an audience that already exists elsewhere for the same persona but hasn't run in
 * this campaign. Always needs your approval; the copy is created PAUSED in Meta.
 *
 * One proposal per campaign per run; audiences already proposed in the last 30 days are skipped.
 */
const WINDOW_DAYS = 7

export function rule10AudienceTest(ctx: EvaluatorContext): RuleResult[] {
  const scope = "testing.audience"
  const minResults = ruleNumber(ctx.rules, scope, "min_results_7d", 10)
  const maxLiveSets = ruleNumber(ctx.rules, scope, "max_live_ad_sets", 4)
  const pool = ctx.audiencePool ?? []
  if (!pool.length) return []

  const from = isoDateUtcDaysAgo(WINDOW_DAYS)
  const out: RuleResult[] = []

  for (const campaign of ctx.campaigns) {
    if (campaign.platform !== "META") continue
    const sets = ctx.adSets.filter((s) => s.campaign_id === campaign.id)
    const live = sets.filter((s) => (s.status === "TEST" || s.status === "SCALE") && s.platform_adset_id)
    if (!live.length || live.length >= maxLiveSets) continue

    const target = targetCacUsd(ctx, campaign)
    if (!(target > 0)) continue

    // Best live ad set by 7-day cost per result on its optimization event.
    let best: { set: (typeof live)[number]; spend: number; conv: number } | null = null
    for (const set of live) {
      const ev = (set as { conv_event?: string | null }).conv_event || resultEvent(campaign)
      let spend = 0
      let conv = 0
      for (const r of ctx.performanceDaily) {
        if (r.level !== "ad_set" || r.entity_id !== set.id || r.date < from) continue
        spend += Number(r.spend_usd) || 0
        if (r.conv_event === ev) conv += Number(r.conversions) || 0
      }
      if (conv < minResults) continue
      const cpr = spend / conv
      if (cpr > target) continue
      if (!best || cpr < best.spend / best.conv) best = { set, spend, conv }
    }
    if (!best) continue

    const usedAudiences = new Set(sets.map((s) => s.audience_src.toLowerCase()))
    const proposedRecently = new Set(
      ctx.recentRecs
        .filter((r) => r.kind === "CREATE_AD_SET" && r.target_campaign_id === campaign.id)
        .map((r) => String((r.payload as Record<string, unknown>)?.audience_src ?? "").toLowerCase())
    )
    const candidate = pool.find(
      (a) =>
        a.persona === campaign.persona &&
        a.campaign_id !== campaign.id &&
        !usedAudiences.has(a.audience_src.toLowerCase()) &&
        !proposedRecently.has(a.audience_src.toLowerCase())
    )
    if (!candidate) continue

    const cpr = best.spend / best.conv
    const label = best.set.legacy_id ?? best.set.name
    out.push({
      kind: "CREATE_AD_SET",
      target: { campaignId: campaign.id, adSetId: best.set.id },
      payload: {
        rule: "10-audience-test",
        source_ad_set_id: best.set.id,
        targeting_from_ad_set_id: candidate.id,
        audience_src: candidate.audience_src,
        placement: candidate.placement,
        created_paused: true,
      },
      evidence: {
        window_days: WINDOW_DAYS,
        source_spend_usd: best.spend,
        source_results: best.conv,
        source_cost_per_result_usd: cpr,
        target_cost_usd: target,
        live_ad_sets: live.length,
        audience_from: candidate.legacy_id,
      },
      rationale: `${campaign.legacy_id ?? campaign.name}: ${label} is working (${best.conv} results at $${cpr.toFixed(2)} vs $${target.toFixed(2)} target). Test the "${candidate.audience_src}" audience (from ${candidate.legacy_id ?? "another campaign"}) as a paused copy with the same ads.`,
      confidence: 0.6,
    })
  }
  return out
}
