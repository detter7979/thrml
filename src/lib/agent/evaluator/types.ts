import type { Ad, AdSet, Campaign, RecKindT, Recommendation } from "@/types/paid-media"

/** One row from public.performance_master (subset used by evaluator). */
export type PerformanceMasterRow = {
  id: number
  date: string
  campaign_id: string
  ad_set_id: string | null
  ad_id: string | null
  level: "campaign" | "ad_set" | "ad"
  platform: string
  persona: string
  service: string
  geo: string
  phase: string
  funnel: string
  conv_event: string | null
  launch_week: string
  impressions: number | null
  clicks: number | null
  link_clicks: number | null
  spend_usd: number | null
  cpm: number | null
  cpc: number | null
  ctr: number | null
  conversions: number | null
  cost_per_conv: number | null
  revenue_usd: number | null
  signup_count: number | null
  onboard_count: number | null
  listing_count: number | null
  activation_count: number | null
  cac_signup: number | null
  cac_activation: number | null
  payback_days: number | null
  cohort_week: string | null
  refreshed_at: string
}

/** One row from public.performance_daily (subset). */
export type PerformanceDailyRow = {
  id: number
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
  ingested_at: string
}

export type EvaluatorContext = {
  campaigns: Campaign[]
  adSets: AdSet[]
  ads: Ad[]
  performance: PerformanceMasterRow[]
  performanceDaily: PerformanceDailyRow[]
  /** Composite key `${scope}::${rule_key}` → parsed JSON value */
  rules: Record<string, unknown>
  recentRecs: Recommendation[]
  /** Campaign IDs with an ADJUST_BUDGET actions_log row in the last 30d (first bump cap). */
  campaignsWithRecentBudgetAction: Set<string>
}

export type RuleTarget = {
  campaignId?: string
  adSetId?: string
  adId?: string
}

export type RuleResult = {
  kind: RecKindT
  target: RuleTarget
  payload: Record<string, unknown>
  evidence: Record<string, unknown>
  rationale: string
  confidence: number
}

export type Rule = (ctx: EvaluatorContext) => RuleResult[]

export type EvaluatorRunResult = {
  ok: boolean
  runId: string | null
  error?: string
  dryRun: boolean
  proposalsRaw: number
  proposalsAfterDedupe: number
  proposalsWritten: number
  proposals: RuleResult[]
  duration_ms: number
}

export function ruleKey(scope: string, key: string): string {
  return `${scope}::${key}`
}

export function ruleNumber(rules: Record<string, unknown>, scope: string, key: string, fallback: number): number {
  const v = rules[ruleKey(scope, key)]
  if (v === undefined || v === null) return fallback
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function ruleString(rules: Record<string, unknown>, scope: string, key: string, fallback: string): string {
  const v = rules[ruleKey(scope, key)]
  if (v === undefined || v === null) return fallback
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  return fallback
}

export function isoDateUtcDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}
