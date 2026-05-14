import type { EvaluatorContext, RuleResult } from "../types"
import { ruleNumber } from "../types"

import { hostGuestCac } from "./_cac-helpers"

function targetCacPersona(ctx: EvaluatorContext, persona: "host" | "guest"): number {
  if (persona === "host") {
    const signup = ruleNumber(ctx.rules, "host.*", "target_cac_signup_usd", NaN)
    if (Number.isFinite(signup) && signup > 0) return signup
    return ruleNumber(ctx.rules, "host.*", "target_cac_activation_usd", 150)
  }
  return ruleNumber(ctx.rules, "guest.*", "target_cac_purchase_usd", 35)
}

function bumpPct(currentDaily: number): number {
  if (currentDaily <= 25) return 0.4
  if (currentDaily <= 75) return 0.35
  if (currentDaily <= 150) return 0.3
  return 0.25
}

export function rule02CampaignBumpBudget(ctx: EvaluatorContext): RuleResult[] {
  const monthlyCap = ruleNumber(ctx.rules, "billing", "monthly_account_cap_usd", 5000)
  const maxDailyPct = ruleNumber(ctx.rules, "underperformance.budget", "max_daily_increase_pct", 30) / 100
  const days = 7
  const out: RuleResult[] = []

  const testCampaigns = ctx.campaigns.filter((c) => c.status === "TEST")
  const sumDailyOthers = (excludeId: string) =>
    testCampaigns.filter((c) => c.id !== excludeId).reduce((s, c) => s + (Number(c.daily_budget_usd) || 0), 0)

  for (const c of testCampaigns) {
    const daily = Number(c.daily_budget_usd) || 0
    if (daily <= 0) continue

    const { cac, spend, conv, dates } = hostGuestCac(ctx.performance, c, days)
    const target = targetCacPersona(ctx, c.persona)
    if (cac === null || conv <= 0) continue
    if (dates.size < 7) continue
    if (cac > target) continue

    const expectedSpend = daily * 7 * 0.8
    if (spend < expectedSpend) continue

    const pct = bumpPct(daily)
    let newDaily = daily * (1 + pct)
    const hadPriorBump = ctx.campaignsWithRecentBudgetAction.has(c.id)
    const maxAllowed = hadPriorBump ? daily * (1 + maxDailyPct) : Number.POSITIVE_INFINITY
    if (hadPriorBump && newDaily > maxAllowed) newDaily = maxAllowed

    const projectedMonthly = (sumDailyOthers(c.id) + newDaily) * 30
    if (projectedMonthly > monthlyCap) continue

    const margin = (target - cac) / Math.max(target, 1e-6)
    const confidence = Math.min(0.9, Math.max(0.7, 0.7 + margin * 0.5))

    out.push({
      kind: "ADJUST_BUDGET",
      target: { campaignId: c.id },
      payload: {
        rule: "02-campaign-bump-budget",
        current_daily_budget_usd: daily,
        new_daily_budget_usd: Math.round(newDaily * 100) / 100,
        bump_pct: pct,
        first_bump_30d: !hadPriorBump,
      },
      evidence: {
        window_days: days,
        spend_usd: spend,
        cac_usd: cac,
        target_cac_usd: target,
        dates_with_data: dates.size,
        expected_min_spend: expectedSpend,
      },
      rationale: `${c.legacy_id ?? c.name}: 7d CAC $${cac.toFixed(2)} at/below $${target.toFixed(2)} target; spend $${spend.toFixed(0)} ≥ 80% of pacing ($${expectedSpend.toFixed(0)}). Propose daily budget $${daily.toFixed(2)} → $${newDaily.toFixed(2)}.`,
      confidence,
    })
  }

  return out
}
