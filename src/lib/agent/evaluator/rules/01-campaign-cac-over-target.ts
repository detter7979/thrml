import type { Campaign } from "@/types/paid-media"

import type { EvaluatorContext, RuleResult } from "../types"
import { ruleNumber } from "../types"

import { hostGuestCac, targetCacUsd } from "./_cac-helpers"

export function rule01CampaignCacOverTarget(ctx: EvaluatorContext): RuleResult[] {
  const mult = ruleNumber(ctx.rules, "underperformance.campaign_level", "cac_multiplier_vs_target", 2.5)
  const minDays = ruleNumber(ctx.rules, "underperformance.campaign_level", "days_above_target_cac", 14)
  const minSpend = ruleNumber(ctx.rules, "underperformance.campaign_level", "min_spend_before_action_usd", 500)
  const daysWindow = 14
  const out: RuleResult[] = []

  for (const c of ctx.campaigns) {
    const { cac, spend, conv, dates } = hostGuestCac(ctx.performance, c, daysWindow)
    const target = targetCacUsd(ctx, c)
    if (cac === null || conv <= 0) continue
    if (dates.size < minDays) continue
    if (spend < minSpend) continue
    if (cac <= target * mult) continue

    const siblings = ctx.campaigns.filter(
      (x) => x.id !== c.id && x.persona === c.persona && x.service === c.service && (x.status === "TEST" || x.status === "SCALE")
    )
    let bestSibling: Campaign | null = null
    let bestCac = Number.POSITIVE_INFINITY
    for (const s of siblings) {
      const sc = hostGuestCac(ctx.performance, s, daysWindow)
      if (sc.cac !== null && sc.cac < bestCac && sc.conv > 0) {
        bestCac = sc.cac
        bestSibling = s
      }
    }
    const siblingLabel = bestSibling?.legacy_id ?? bestSibling?.name ?? "another campaign in this service"

    const ratio = cac / Math.max(target, 1e-6)
    const confidence = Math.min(1, Math.max(0, 1 - target / cac))

    const rationale = `${c.legacy_id ?? c.id} (${c.service}) at $${cac.toFixed(2)} CAC vs $${target.toFixed(2)} target (>${mult}× implied) over ${daysWindow}d / ${dates.size} active days. $${spend.toFixed(0)} spend. Recommend killing and reallocating to ${siblingLabel}.`

    out.push({
      kind: "KILL_CAMPAIGN",
      target: { campaignId: c.id },
      payload: {
        rule: "01-campaign-cac-over-target",
        suggested_action: "KILL_CAMPAIGN",
        actual_cac_usd: cac,
        target_cac_usd: target,
        multiplier: mult,
        window_days: daysWindow,
        spend_usd: spend,
        conversions: conv,
        best_sibling_campaign_id: bestSibling?.id ?? null,
      },
      evidence: {
        dates_with_data: dates.size,
        conv_event_focus: c.persona === "host" ? "BH" : "IC+PUR",
        cac_vs_target_ratio: ratio,
      },
      rationale,
      confidence,
    })
  }

  return out
}
