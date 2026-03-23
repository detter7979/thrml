export type AgentConfig = {
  platform: string
  target_cpa: number
  max_cpa_multiplier: number
  scale_threshold: number
  min_spend_to_evaluate: number
  max_days_no_purchase: number
  min_ctr_pct: number
  min_spend_for_ctr: number
  budget_scale_pct: number
  goal_type: "guest" | "host"
  target_cpa_prospecting: number | null
  target_cpa_retargeting: number | null
  warn_days_before_reduce: number
  reduce_days_before_pause: number
  conversion_event: string
  min_conversions_to_scale: number
  ab_test_cpa_threshold: number
}

export type InsightRow = {
  campaign_id: string
  campaign_name: string
  adset_id: string
  adset_name: string
  ad_id: string
  ad_name: string
  spend: number
  impressions: number
  clicks: number
  purchases: number
  revenue: number
  ctr: number
  cpa: number
}

export type RegistryAdset = {
  platform_id: string
  target_cpa_override: number | null
  warm_up_until: string | null
  ab_test_generation: number | null
  daily_budget: number | null
  goal_type: "guest" | "host" | null
  funnel_stage: string | null
  campaign_type: string | null
  consecutive_warn_days: number
  consecutive_reduce_days: number
  last_warn_date: string | null
  last_reduce_date: string | null
}

export type Decision = {
  entity_type: "adset" | "creative"
  entity_id: string
  entity_name: string
  parent_entity_id?: string
  campaign_id?: string
  platform: string
  rule_triggered: string
  spend_at_decision: number
  cpa_at_decision: number
  target_cpa: number
  action_taken: "PAUSED" | "SCALED" | "BUDGET_REDUCED" | "FLAGGED" | "WARNED" | "AB_TEST"
  requires_creative: boolean
  creative_brief?: string
  audience_suggestion?: string
  should_duplicate?: boolean
  goal_type: "guest" | "host"
  cascade_reset?: boolean
  increment_warn_days?: boolean
  increment_reduce_days?: boolean
  reset_warn_days?: boolean
  ab_target_campaign_type?: string
  ab_is_lal_graduation?: boolean
}

export function resolveTargetCpa(config: AgentConfig, reg: RegistryAdset | undefined): number {
  if (reg?.target_cpa_override && Number(reg.target_cpa_override) > 0) {
    return Number(reg.target_cpa_override)
  }
  const ct = reg?.campaign_type ?? ""
  const fs = reg?.funnel_stage ?? ""
  const isRT = ct === "retargeting" || fs === "retargeting" || fs === "host_retargeting"
  const isProsp =
    ct === "prospecting" ||
    ct === "host_acquisition" ||
    fs === "lal" ||
    fs === "awareness" ||
    fs === "consideration" ||
    fs === "host_interest"
  if (isRT) {
    return Number(config.target_cpa_retargeting ?? Number(config.target_cpa) * 0.7)
  }
  if (isProsp) {
    return Number(config.target_cpa_prospecting ?? Number(config.target_cpa) * 1.2)
  }
  return Number(config.target_cpa)
}

export function evaluateInsights(
  rows: InsightRow[],
  config: AgentConfig,
  registryAdsets: RegistryAdset[] = []
): Decision[] {
  const decisions: Decision[] = []
  const today = new Date().toISOString().slice(0, 10)
  const goalType = config.goal_type ?? "guest"
  const minConvScale = Number(config.min_conversions_to_scale ?? 3)
  const abThreshold = Number(config.ab_test_cpa_threshold ?? 0.6)

  const registryMap = new Map(registryAdsets.map((r) => [r.platform_id, r]))

  const adsetMap = new Map<
    string,
    {
      spend: number
      purchases: number
      clicks: number
      impressions: number
      adset_name: string
      campaign_id: string
      ads: InsightRow[]
    }
  >()

  for (const row of rows) {
    if (!adsetMap.has(row.adset_id)) {
      adsetMap.set(row.adset_id, {
        spend: 0,
        purchases: 0,
        clicks: 0,
        impressions: 0,
        adset_name: row.adset_name,
        campaign_id: row.campaign_id,
        ads: [],
      })
    }
    const e = adsetMap.get(row.adset_id)!
    e.spend += row.spend
    e.purchases += row.purchases
    e.clicks += row.clicks
    e.impressions += row.impressions
    e.ads.push(row)
  }

  for (const [adsetId, data] of adsetMap.entries()) {
    const { spend, purchases, adset_name, ads, campaign_id } = data
    if (spend < Number(config.min_spend_to_evaluate)) continue

    const reg = registryMap.get(adsetId)
    if (reg?.warm_up_until && today <= reg.warm_up_until) continue

    const effectiveTarget = resolveTargetCpa(config, reg)

    const cpa = purchases > 0 ? spend / purchases : Number.POSITIVE_INFINITY
    const maxCpa = effectiveTarget * Number(config.max_cpa_multiplier)
    const warnCpa = effectiveTarget * 1.5
    const reduceCpa = effectiveTarget * 1.2
    const scaleCpa = effectiveTarget * Number(config.scale_threshold)

    if (cpa > maxCpa) {
      decisions.push({
        entity_type: "adset",
        entity_id: adsetId,
        entity_name: adset_name,
        campaign_id,
        platform: config.platform,
        rule_triggered: `CPA ${fmtCpa(cpa)} > max ${fmtCpa(maxCpa)} (${config.max_cpa_multiplier}x target $${effectiveTarget})`,
        spend_at_decision: spend,
        cpa_at_decision: cpa,
        target_cpa: effectiveTarget,
        action_taken: "PAUSED",
        requires_creative: true,
        creative_brief: `"${adset_name}" paused — CPA too high. ${getReplacementStrategy(adset_name)}`,
        audience_suggestion: getAudienceSuggestion(adset_name),
        goal_type: goalType,
      })
      continue
    }

    if (cpa > reduceCpa && Number.isFinite(cpa) && cpa <= warnCpa) {
      decisions.push({
        entity_type: "adset",
        entity_id: adsetId,
        entity_name: adset_name,
        campaign_id,
        platform: config.platform,
        rule_triggered: `CPA ${fmtCpa(cpa)} elevated (1.2x–1.5x target). Monitoring — no budget change yet.`,
        spend_at_decision: spend,
        cpa_at_decision: cpa,
        target_cpa: effectiveTarget,
        action_taken: "WARNED",
        requires_creative: false,
        goal_type: goalType,
      })
    } else if (cpa > warnCpa && Number.isFinite(cpa)) {
      decisions.push({
        entity_type: "adset",
        entity_id: adsetId,
        entity_name: adset_name,
        campaign_id,
        platform: config.platform,
        rule_triggered: `CPA ${fmtCpa(cpa)} elevated (>${fmtCpa(warnCpa)}). Reducing budget ${(Number(config.budget_scale_pct) * 100).toFixed(0)}% before pause threshold.`,
        spend_at_decision: spend,
        cpa_at_decision: cpa,
        target_cpa: effectiveTarget,
        action_taken: "BUDGET_REDUCED",
        requires_creative: false,
        goal_type: goalType,
      })
    }

    if (cpa < scaleCpa && purchases > 0) {
      const generation = reg?.ab_test_generation ?? 0
      decisions.push({
        entity_type: "adset",
        entity_id: adsetId,
        entity_name: adset_name,
        campaign_id,
        platform: config.platform,
        rule_triggered: `CPA ${fmtCpa(cpa)} < scale threshold ${fmtCpa(scaleCpa)}. Scaling budget +${(Number(config.budget_scale_pct) * 100).toFixed(0)}%.`,
        spend_at_decision: spend,
        cpa_at_decision: cpa,
        target_cpa: effectiveTarget,
        action_taken: "SCALED",
        requires_creative: false,
        goal_type: goalType,
      })

      if (cpa < effectiveTarget * abThreshold && generation < 3 && purchases >= minConvScale) {
        decisions.push({
          entity_type: "adset",
          entity_id: adsetId,
          entity_name: adset_name,
          campaign_id,
          platform: config.platform,
          rule_triggered: `Strong performer (CPA ${fmtCpa(cpa)} = ${((cpa / effectiveTarget) * 100).toFixed(0)}% of target). A/B test next audience variation.`,
          spend_at_decision: spend,
          cpa_at_decision: cpa,
          target_cpa: effectiveTarget,
          action_taken: "AB_TEST",
          requires_creative: false,
          should_duplicate: true,
          audience_suggestion: getNextAudienceToTest(adset_name, generation),
          goal_type: goalType,
        })
      }
    }

    for (const ad of ads) {
      if (ad.spend < Number(config.min_spend_for_ctr)) continue
      if (ad.ctr < Number(config.min_ctr_pct) && ad.impressions > 500) {
        decisions.push({
          entity_type: "creative",
          entity_id: ad.ad_id,
          entity_name: ad.ad_name,
          parent_entity_id: ad.adset_id,
          campaign_id: ad.campaign_id,
          platform: config.platform,
          rule_triggered: `CTR ${(ad.ctr * 100).toFixed(2)}% < min ${(Number(config.min_ctr_pct) * 100).toFixed(2)}% after $${ad.spend.toFixed(0)} spend`,
          spend_at_decision: ad.spend,
          cpa_at_decision: ad.cpa,
          target_cpa: effectiveTarget,
          action_taken: "PAUSED",
          requires_creative: true,
          creative_brief: `"${ad.ad_name}" — poor CTR. Hook is failing. Replace the first 3 seconds entirely.`,
          goal_type: goalType,
        })
      }
    }
  }

  return decisions
}

function fmtCpa(cpa: number): string {
  return Number.isFinite(cpa) ? `$${cpa.toFixed(2)}` : "∞"
}

function getAudienceSuggestion(adsetName: string): string {
  const l = adsetName.toLowerCase()
  if (l.includes("interest") || l.includes("int"))
    return "Switch from interest to LAL 1% seeded from checkout starters"
  if (l.includes("lal") || l.includes("sim") || l.includes("lookalike"))
    return "Try LAL 2-3% for more volume, or switch to interest layering"
  if (l.includes("rt") || l.includes("retarget") || l.includes("checkout"))
    return "Expand RT window (7D → 30D) or broaden exclusions"
  if (l.includes("broad")) return "Layer on wellness or biohacking interest signal to guide algorithm"
  return "Test: (1) LAL from purchasers, (2) wellness interest broad, (3) retargeting checkout 30D"
}

function getNextAudienceToTest(adsetName: string, generation: number): string {
  const l = adsetName.toLowerCase()
  let suggestions: string[]
  if (l.includes("interest"))
    suggestions = ["LAL 1% from checkout starters", "LAL 2% from all visitors", "Broad with purchase optimization"]
  else if (l.includes("lal") || l.includes("lookalike"))
    suggestions = ["LAL 2-3% (wider)", "Interest: biohacking + wellness", "Broad + advantage+ audience"]
  else if (l.includes("rt") || l.includes("retarget"))
    suggestions = ["View listing 7D (tighter window)", "All visitors 60D (wider)", "Newsletter subscribers CRM"]
  else suggestions = ["LAL 1% from purchasers", "Interest: biohacking", "Retargeting checkout 14D"]
  return suggestions[generation % suggestions.length] ?? "LAL 1% from purchasers"
}

function getReplacementStrategy(adsetName: string): string {
  const l = adsetName.toLowerCase()
  if (l.includes("interest")) return "Replace with LAL audience seeded from checkout starters or purchasers."
  if (l.includes("lal")) return "Replace with broader LAL (2-3%) or switch to interest targeting."
  if (l.includes("rt") || l.includes("retarget")) return "Replace with different RT window or tighter exclusion set."
  return "Replace with a different audience type — test LAL vs interest vs retargeting."
}
