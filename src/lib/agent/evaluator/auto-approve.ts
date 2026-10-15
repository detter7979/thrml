import type { EvaluatorContext, RuleResult } from "./types"
import { isoDateUtcDaysAgo, ruleNumber, ruleString } from "./types"

/**
 * Phase B auto-approval. Only active when rules_config global::approval_mode is
 * "AUTO_APPROVE_LOW_STAKES"; otherwise every recommendation waits for a human.
 *
 * Auto-approved (then executed by the Meta ads agent the same day):
 *   - PAUSE_AD from rule 03 when clicks ≥ auto_approve::pause_under_perf_threshold.clicks_min
 *   - PAUSE_AD_SET from rule 09 with confidence ≥ auto_approve::min_confidence (0.8)
 *   - ADJUST_BUDGET when the change is ≤ auto_approve::budget_change_under_usd per day and
 *     the increase is ≤ underperformance.budget::max_daily_increase_pct
 * Never auto-approved:
 *   - any kind in auto_approve::requires_human_kinds (kills, new campaigns, geo, promotions)
 *   - anything when the newest performance data is older than 36h (stale data)
 *   - beyond auto_approve::max_actions_per_run per run (default 5)
 */

export const AUTO_APPROVE_MODE = "AUTO_APPROVE_LOW_STAKES"

export type AutoApprovalDecision = { eligible: boolean; reason: string }

function requiresHumanKinds(ctx: EvaluatorContext): Set<string> {
  const raw = ctx.rules["auto_approve::requires_human_kinds"]
  const list = Array.isArray(raw) ? raw.map(String) : ["CREATE_CAMPAIGN", "KILL_CAMPAIGN", "EXPAND_GEO", "PROMOTE_WINNER"]
  // Kills are irreversible; always a human call regardless of config.
  return new Set([...list, "KILL_CAMPAIGN", "KILL_AD_SET", "KILL_AD", "CREATE_CAMPAIGN"])
}

export function dataIsFresh(ctx: EvaluatorContext): boolean {
  const newest = ctx.performanceDaily.reduce((max, r) => (r.date > max ? r.date : max), "")
  // Daily rows are dated by day; "fresh" = yesterday or today (≈ within 36h of the cron).
  return newest !== "" && newest >= isoDateUtcDaysAgo(1)
}

export function autoApprovalDecision(ctx: EvaluatorContext, p: RuleResult): AutoApprovalDecision {
  if (requiresHumanKinds(ctx).has(p.kind)) return { eligible: false, reason: `${p.kind} always needs a human` }
  if (!dataIsFresh(ctx)) return { eligible: false, reason: "performance data is stale" }

  const rule = String(p.payload.rule ?? "")
  const minConfidence = ruleNumber(ctx.rules, "auto_approve", "min_confidence", 0.8)

  if (p.kind === "PAUSE_AD" && rule === "03-ad-cpc-3x-median") {
    const raw = ctx.rules["auto_approve::pause_under_perf_threshold"]
    const clicksMin =
      typeof raw === "object" && raw !== null ? Number((raw as { clicks_min?: number }).clicks_min ?? 100) : 100
    const clicks = Number(p.evidence.clicks_7d ?? 0)
    return clicks >= clicksMin
      ? { eligible: true, reason: `CPC outlier with ${clicks} clicks (≥ ${clicksMin})` }
      : { eligible: false, reason: `only ${clicks} clicks (< ${clicksMin})` }
  }

  if (p.kind === "PAUSE_AD_SET" && rule === "09-ad-set-wasted-spend") {
    return p.confidence >= minConfidence
      ? { eligible: true, reason: `wasted spend, confidence ${p.confidence.toFixed(2)}` }
      : { eligible: false, reason: `confidence ${p.confidence.toFixed(2)} < ${minConfidence}` }
  }

  if (p.kind === "ADJUST_BUDGET") {
    const current = Number(p.payload.current_daily_budget_usd ?? NaN)
    const next = Number(p.payload.new_daily_budget_usd ?? NaN)
    if (!Number.isFinite(current) || !Number.isFinite(next) || current <= 0) {
      return { eligible: false, reason: "budget values missing" }
    }
    const maxChangeUsd = ruleNumber(ctx.rules, "auto_approve", "budget_change_under_usd", 20)
    const maxIncreasePct = ruleNumber(ctx.rules, "underperformance.budget", "max_daily_increase_pct", 30) / 100
    const delta = next - current
    if (Math.abs(delta) > maxChangeUsd) return { eligible: false, reason: `change $${delta.toFixed(2)}/day exceeds $${maxChangeUsd}` }
    if (delta > 0 && delta / current > maxIncreasePct + 1e-9) {
      return { eligible: false, reason: `increase ${(100 * delta / current).toFixed(0)}% exceeds ${(maxIncreasePct * 100).toFixed(0)}%` }
    }
    return { eligible: true, reason: `budget change $${delta.toFixed(2)}/day within limits` }
  }

  return { eligible: false, reason: "kind not covered by auto-approval" }
}

export function isAutoApproveMode(ctx: EvaluatorContext): boolean {
  return ruleString(ctx.rules, "global", "approval_mode", "ALL_REQUIRE_APPROVAL") === AUTO_APPROVE_MODE
}

export function maxAutoActionsPerRun(ctx: EvaluatorContext): number {
  return Math.max(0, Math.round(ruleNumber(ctx.rules, "auto_approve", "max_actions_per_run", 5)))
}
