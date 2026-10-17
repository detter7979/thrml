import type { EvaluatorContext, PerformanceDailyRow, RuleResult } from "../types"
import { isoDateUtcDaysAgo, ruleNumber } from "../types"

import { resultEvent, targetCacUsd } from "./_cac-helpers"

/**
 * Rule 09 — pause ad sets that are burning budget.
 *
 * Budgets live at the campaign level (Meta CBO), so scaling winners is rule 02's job; this
 * rule handles the other side at ad-set level, faster than rule 01's 14-day campaign kill:
 *   - no conversions after spending ≥ `spend_multiple_no_conv` × target CAC, or
 *   - CPA ≥ `cpa_multiple` × target CAC after spending ≥ `cpa_multiple` × target CAC
 * over the last 7 days, with at least `min_active_days` days of delivery.
 * Never pauses the last live ad set in a campaign (that is a campaign decision).
 */

const WINDOW_DAYS = 7

/** Spend from every row; conversions only for the ad set's optimization event (e.g. BH, VC). */
function adSetWindow(rows: PerformanceDailyRow[], adSetId: string, resultEvent: string) {
  const from = isoDateUtcDaysAgo(WINDOW_DAYS)
  let spend = 0
  let conv = 0
  const days = new Set<string>()
  for (const r of rows) {
    if (r.level !== "ad_set" || r.entity_id !== adSetId || r.date < from) continue
    const s = Number(r.spend_usd) || 0
    spend += s
    if (r.conv_event === resultEvent) conv += Number(r.conversions) || 0
    if (s > 0) days.add(r.date)
  }
  return { spend, conv, activeDays: days.size }
}

export function rule09AdSetWastedSpend(ctx: EvaluatorContext): RuleResult[] {
  const scope = "underperformance.ad_set"
  const noConvMultiple = ruleNumber(ctx.rules, scope, "spend_multiple_no_conv", 2)
  const cpaMultiple = ruleNumber(ctx.rules, scope, "cpa_multiple", 3)
  const minActiveDays = ruleNumber(ctx.rules, scope, "min_active_days", 3)

  const liveSets = ctx.adSets.filter((s) => s.status === "TEST" || s.status === "SCALE")
  const liveCountByCampaign = new Map<string, number>()
  for (const s of liveSets) liveCountByCampaign.set(s.campaign_id, (liveCountByCampaign.get(s.campaign_id) ?? 0) + 1)

  const out: RuleResult[] = []
  for (const set of liveSets) {
    if ((liveCountByCampaign.get(set.campaign_id) ?? 0) < 2) continue
    const campaign = ctx.campaigns.find((c) => c.id === set.campaign_id)
    if (!campaign) continue

    const target = targetCacUsd(ctx, campaign)
    if (!(target > 0)) continue
    const ev = (set as { conv_event?: string | null }).conv_event || resultEvent(campaign)
    const { spend, conv, activeDays } = adSetWindow(ctx.performanceDaily, set.id, ev)
    if (activeDays < minActiveDays) continue

    const label = set.legacy_id ?? set.name
    if (conv === 0 && spend >= target * noConvMultiple) {
      const over = spend / target - noConvMultiple
      out.push({
        kind: "PAUSE_AD_SET",
        target: { campaignId: set.campaign_id, adSetId: set.id },
        payload: { rule: "09-ad-set-wasted-spend", reason: "no_conversions" },
        evidence: { window_days: WINDOW_DAYS, spend_usd: spend, conversions: conv, target_cac_usd: target, active_days: activeDays },
        rationale: `Ad set ${label}: $${spend.toFixed(0)} spent over ${activeDays} days with no conversions (${(spend / target).toFixed(1)}× the $${target.toFixed(0)} target CAC). Pause and let the campaign shift budget to the other ad sets.`,
        confidence: Math.min(0.95, 0.8 + over * 0.05),
      })
      continue
    }

    if (conv > 0) {
      const cpa = spend / conv
      if (cpa >= target * cpaMultiple && spend >= target * cpaMultiple) {
        out.push({
          kind: "PAUSE_AD_SET",
          target: { campaignId: set.campaign_id, adSetId: set.id },
          payload: { rule: "09-ad-set-wasted-spend", reason: "cpa_over_target" },
          evidence: { window_days: WINDOW_DAYS, spend_usd: spend, conversions: conv, cpa_usd: cpa, target_cac_usd: target, active_days: activeDays },
          rationale: `Ad set ${label}: 7-day CPA $${cpa.toFixed(2)} is ${(cpa / target).toFixed(1)}× the $${target.toFixed(0)} target on $${spend.toFixed(0)} spend. Pause.`,
          confidence: Math.min(0.9, 0.7 + (cpa / target - cpaMultiple) * 0.05),
        })
      }
    }
  }
  // Never pause every ad set in a campaign in one run: keep the best one (most conversions,
  // then lowest spend) — pausing the whole campaign is rule 01's call.
  const byCampaign = new Map<string, RuleResult[]>()
  for (const r of out) {
    const k = r.target.campaignId ?? ""
    byCampaign.set(k, [...(byCampaign.get(k) ?? []), r])
  }
  const keep: RuleResult[] = []
  for (const [cid, recs] of byCampaign) {
    const live = liveCountByCampaign.get(cid) ?? 0
    if (recs.length < live) {
      keep.push(...recs)
      continue
    }
    const ranked = [...recs].sort((a, b) => {
      const ca = Number(a.evidence.conversions) || 0
      const cb = Number(b.evidence.conversions) || 0
      return ca !== cb ? ca - cb : (Number(b.evidence.spend_usd) || 0) - (Number(a.evidence.spend_usd) || 0)
    })
    keep.push(...ranked.slice(0, Math.max(0, live - 1)))
  }
  return keep
}
