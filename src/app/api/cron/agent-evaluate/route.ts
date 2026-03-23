import { NextRequest, NextResponse } from "next/server"

import {
  fetchGoogleInsights,
  fetchCampaignBudgetMicros,
  pauseAdGroup,
  pauseGoogleAd,
  scaleGoogleBudget,
} from "@/lib/agent/google-ads-api"
import {
  duplicateAdSet,
  fetchActiveAdSets,
  fetchMetaInsights,
  pauseAd,
  pauseAdSet,
  scaleAdSetBudget,
} from "@/lib/agent/meta-api"
import { evaluateInsights, type AgentConfig, type RegistryAdset } from "@/lib/agent/decision-engine"
import { createAdminClient } from "@/lib/supabase/admin"

function yesterday() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("cron_secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

function nextRunUtc() {
  const next = new Date()
  next.setUTCDate(next.getUTCDate() + 1)
  next.setUTCHours(3, 0, 0, 0)
  return next.toISOString()
}

function extractConcept(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes("social") || lower.includes("review")) return "SocialProof"
  if (lower.includes("recover")) return "Recovery"
  if (lower.includes("access") || lower.includes("membership")) return "Access"
  if (lower.includes("biohack")) return "Biohack"
  if (lower.includes("host")) return "HostEarn"
  return "SocialProof"
}

function generateHookSuggestion(rule: string) {
  if (rule.includes("CPA"))
    return "Lead with social proof or a specific outcome claim — your current angle isn't converting."
  if (rule.includes("CTR"))
    return 'First 3 seconds need a pattern interrupt. Try: a question, a bold number, or contrast ("You\'re paying $200/month for a gym you barely use...").'
  return "Test a new opening hook that immediately communicates private access + no membership."
}

type GoalType = "guest" | "host"

function normalizeGoalType(raw: unknown): GoalType {
  return raw === "host" ? "host" : "guest"
}

function mapRegistryAdsets(rows: Record<string, unknown>[] | null): RegistryAdset[] {
  return (rows ?? []).map((r) => {
    const rawCr = r.campaign_registry
    const cr = (Array.isArray(rawCr) ? rawCr[0] : rawCr) as
      | { campaign_type?: string; goal_type?: string }
      | null
      | undefined
    return {
      platform_id: String(r.platform_id ?? ""),
      target_cpa_override: r.target_cpa_override != null ? Number(r.target_cpa_override) : null,
      warm_up_until: r.warm_up_until ? String(r.warm_up_until).slice(0, 10) : null,
      ab_test_generation: r.ab_test_generation != null ? Number(r.ab_test_generation) : null,
      daily_budget: r.daily_budget != null ? Number(r.daily_budget) : null,
      goal_type: r.goal_type === "host" || r.goal_type === "guest" ? (r.goal_type as GoalType) : null,
      funnel_stage: r.funnel_stage != null ? String(r.funnel_stage) : null,
      campaign_type: cr?.campaign_type != null ? String(cr.campaign_type) : null,
      consecutive_warn_days: Number(r.consecutive_warn_days ?? 0),
      consecutive_reduce_days: Number(r.consecutive_reduce_days ?? 0),
      last_warn_date: r.last_warn_date ? String(r.last_warn_date).slice(0, 10) : null,
      last_reduce_date: r.last_reduce_date ? String(r.last_reduce_date).slice(0, 10) : null,
    }
  })
}

type Platform = "meta" | "google"

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const date = yesterday()
  const supabase = createAdminClient()
  const results = {
    meta: { decisions: 0, actions: 0, errors: 0 },
    google: { decisions: 0, actions: 0, errors: 0 },
  }

  const { data: configs } = await supabase
    .from("agent_config")
    .select("*")
    .eq("is_active", true)
    .order("platform")
    .order("goal_type")

  if (!configs?.length) {
    return NextResponse.json({ ok: true, message: "No active agent configs" })
  }

  for (const raw of configs) {
    const config = raw as Record<string, unknown>
    const platform = String(config.platform ?? "") as Platform
    if (platform !== "meta" && platform !== "google") continue

    const goalType = normalizeGoalType(config.goal_type)

    const agentCfg: AgentConfig = {
      platform,
      goal_type: goalType,
      target_cpa: Number(config.target_cpa ?? 0),
      max_cpa_multiplier: Number(config.max_cpa_multiplier ?? 2),
      scale_threshold: Number(config.scale_threshold ?? 0.8),
      min_spend_to_evaluate: Number(config.min_spend_to_evaluate ?? 0),
      max_days_no_purchase: Number(config.max_days_no_purchase ?? 3),
      min_ctr_pct: Number(config.min_ctr_pct ?? 0),
      min_spend_for_ctr: Number(config.min_spend_for_ctr ?? 0),
      budget_scale_pct: Number(config.budget_scale_pct ?? 0.2),
      target_cpa_prospecting:
        config.target_cpa_prospecting != null && config.target_cpa_prospecting !== ""
          ? Number(config.target_cpa_prospecting)
          : null,
      target_cpa_retargeting:
        config.target_cpa_retargeting != null && config.target_cpa_retargeting !== ""
          ? Number(config.target_cpa_retargeting)
          : null,
      warn_days_before_reduce: Number(config.warn_days_before_reduce ?? 3),
      reduce_days_before_pause: Number(config.reduce_days_before_pause ?? 7),
      conversion_event: String(config.conversion_event ?? "purchase"),
      min_conversions_to_scale: Number(config.min_conversions_to_scale ?? 3),
      ab_test_cpa_threshold: Number(config.ab_test_cpa_threshold ?? 0.6),
    }

    try {
      let campaignQuery = supabase.from("campaign_registry").select("platform_id").eq("platform", platform)
      if (goalType === "guest") {
        campaignQuery = campaignQuery.or("goal_type.eq.guest,goal_type.is.null")
      } else {
        campaignQuery = campaignQuery.eq("goal_type", "host")
      }
      const { data: goalCampaigns } = await campaignQuery

      let registryQuery = supabase
        .from("adset_registry")
        .select(
          `platform_id, target_cpa_override, warm_up_until, ab_test_generation, daily_budget,
           funnel_stage, goal_type, consecutive_warn_days, consecutive_reduce_days,
           last_warn_date, last_reduce_date,
           campaign_registry!inner(campaign_type, goal_type)`
        )
        .eq("platform", platform)
      if (goalType === "guest") {
        registryQuery = registryQuery.or("goal_type.eq.guest,goal_type.is.null")
      } else {
        registryQuery = registryQuery.eq("goal_type", "host")
      }
      const { data: registryRows } = await registryQuery

      const registryAdsets = mapRegistryAdsets((registryRows ?? []) as Record<string, unknown>[])

      let rawInsights: Array<Record<string, unknown>>
      if (platform === "meta") {
        if (!process.env.META_MARKETING_API_TOKEN || !process.env.META_AD_ACCOUNT_ID) {
          results.meta.errors++
          console.error("[agent-evaluate] Meta env not configured")
          continue
        }
        rawInsights = (await fetchMetaInsights(date, agentCfg.conversion_event)) as unknown as Array<
          Record<string, unknown>
        >
      } else {
        try {
          rawInsights = (await fetchGoogleInsights(date)) as unknown as Array<Record<string, unknown>>
        } catch (e) {
          results.google.errors++
          console.error("[agent-evaluate] Google Ads not configured or OAuth failed", e)
          continue
        }
      }

      const insights = rawInsights.map((r) => ({
        campaign_id: String(r.campaign_id ?? ""),
        campaign_name: String(r.campaign_name ?? ""),
        adset_id: String(r.adset_id ?? r.adgroup_id ?? ""),
        adset_name: String(r.adset_name ?? r.adgroup_name ?? ""),
        ad_id: String(r.ad_id ?? ""),
        ad_name: String(r.ad_name ?? ""),
        spend: Number(r.spend ?? 0),
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.clicks ?? 0),
        purchases: Number(r.purchases ?? 0),
        revenue: Number(r.revenue ?? 0),
        ctr: Number(r.ctr ?? 0),
        cpa: Number(r.cpa ?? 0),
      }))

      const goalCampaignIds = new Set((goalCampaigns ?? []).map((c) => String(c.platform_id ?? "")))
      const filteredInsights =
        goalCampaignIds.size > 0
          ? insights.filter((r) => goalCampaignIds.has(r.campaign_id))
          : insights

      const decisions = evaluateInsights(filteredInsights, agentCfg, registryAdsets)
      results[platform].decisions += decisions.length

      for (const decision of decisions) {
        let executed = false
        let executionError: string | null = null
        let abDuplicateId: string | null = null

        try {
          if (decision.action_taken === "PAUSED") {
            if (platform === "meta") {
              if (decision.entity_type === "adset") {
                executed = await pauseAdSet(decision.entity_id)
              } else {
                executed = await pauseAd(decision.entity_id)
              }
            } else if (decision.entity_type === "adset") {
              executed = await pauseAdGroup(decision.entity_id)
            } else {
              const adGroupId = decision.parent_entity_id
              if (adGroupId) {
                executed = await pauseGoogleAd(adGroupId, decision.entity_id)
              } else {
                executionError = "Missing parent_entity_id for Google ad pause"
              }
            }
            if (executed) results[platform].actions++
          }

          if (decision.action_taken === "BUDGET_REDUCED") {
            const reducePct = Number(agentCfg.budget_scale_pct)
            if (platform === "meta") {
              const adsetsLive = await fetchActiveAdSets()
              const adset = adsetsLive.find((a) => a.id === decision.entity_id)
              if (adset?.daily_budget) {
                const currentDollars = Number(adset.daily_budget) / 100
                executed = await scaleAdSetBudget(decision.entity_id, currentDollars, -reducePct)
                if (executed) {
                  const newDollars = currentDollars * (1 - reducePct)
                  let sel = supabase
                    .from("adset_registry")
                    .select("budget_history")
                    .eq("platform", platform)
                    .eq("platform_id", decision.entity_id)
                  if (goalType === "guest") {
                    sel = sel.or("goal_type.eq.guest,goal_type.is.null")
                  } else {
                    sel = sel.eq("goal_type", "host")
                  }
                  const { data: regRow } = await sel.maybeSingle()

                  const prevHist = regRow?.budget_history
                  const hist = Array.isArray(prevHist) ? [...prevHist] : []
                  hist.push({
                    date: new Date().toISOString(),
                    from: currentDollars,
                    to: newDollars,
                    reason: "CPA elevated",
                  })
                  let upd = supabase
                    .from("adset_registry")
                    .update({
                      last_budget_change_at: new Date().toISOString(),
                      budget_history: hist,
                    })
                    .eq("platform", platform)
                    .eq("platform_id", decision.entity_id)
                  if (goalType === "guest") {
                    upd = upd.or("goal_type.eq.guest,goal_type.is.null")
                  } else {
                    upd = upd.eq("goal_type", "host")
                  }
                  await upd

                  results[platform].actions++
                }
              }
            } else if (decision.campaign_id) {
              const currentMicros = await fetchCampaignBudgetMicros(decision.campaign_id)
              if (currentMicros != null) {
                const newMicros = Math.round(currentMicros * (1 - reducePct))
                executed = await scaleGoogleBudget(decision.campaign_id, newMicros)
                if (executed) results[platform].actions++
              }
            }
          }

          if (decision.action_taken === "AB_TEST" && decision.should_duplicate) {
            if (platform === "google") {
              console.log("[agent-evaluate] Google AB_TEST duplicate not implemented", decision.entity_id)
            } else {
              const newAdsetId = await duplicateAdSet(decision.entity_id)
              if (newAdsetId) {
                abDuplicateId = newAdsetId
                try {
                  await supabase.from("ab_test_log").insert({
                    platform,
                    goal_type: goalType,
                    parent_adset_id: decision.entity_id,
                    duplicate_adset_id: newAdsetId,
                    reason: decision.rule_triggered,
                    audience_change: decision.audience_suggestion ?? "See creative queue",
                    status: "RUNNING",
                  })
                } catch (logErr) {
                  console.error("[agent-evaluate] ab_test_log insert failed", logErr)
                }

                let parentSel = supabase
                  .from("adset_registry")
                  .select("*")
                  .eq("platform_id", decision.entity_id)
                  .eq("platform", platform)
                if (goalType === "guest") {
                  parentSel = parentSel.or("goal_type.eq.guest,goal_type.is.null")
                } else {
                  parentSel = parentSel.eq("goal_type", "host")
                }
                const { data: parentRow } = await parentSel.maybeSingle()

                if (parentRow) {
                  const generation = Number(parentRow.ab_test_generation ?? 0) + 1
                  const safeName = String(parentRow.adset_name ?? "adset").replace(/[^\w\s-]/g, "").slice(0, 80)
                  const newName = `${safeName}_abtest_g${generation}`
                  const adsetGoal =
                    parentRow.goal_type === "host" || parentRow.goal_type === "guest"
                      ? parentRow.goal_type
                      : goalType
                  try {
                    await supabase.from("adset_registry").insert({
                      campaign_registry_id: parentRow.campaign_registry_id,
                      platform,
                      platform_id: newAdsetId,
                      adset_name: newName,
                      aud_type: parentRow.aud_type,
                      audience_desc: decision.audience_suggestion ?? parentRow.audience_desc,
                      market: parentRow.market,
                      daily_budget: parentRow.daily_budget,
                      status: "PAUSED",
                      agent_managed: true,
                      ab_test_parent_id: parentRow.id,
                      ab_test_generation: generation,
                      audience_notes: `A/B test: ${decision.audience_suggestion ?? "new audience"}`,
                      warm_up_until: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
                      goal_type: adsetGoal,
                      funnel_stage: parentRow.funnel_stage ?? null,
                    })
                  } catch (regErr) {
                    console.error("[agent-evaluate] adset_registry insert for A/B failed", regErr)
                  }
                }

                try {
                  await supabase.from("creative_queue").insert({
                    platform,
                    goal_type: goalType,
                    priority: "HIGH",
                    reason: `A/B test created from "${decision.entity_name}" — needs audience update before activating`,
                    concept: null,
                    format: null,
                    ratio: null,
                    cta: null,
                    copy_suggestion: `New ad set ID: ${newAdsetId}\n\nSwap audience to: ${decision.audience_suggestion}\n\nActivate once you've updated the audience in Meta Ads Manager.`,
                    hook_suggestion: null,
                    target_adset_id: newAdsetId,
                    status: "PENDING",
                    queue_type: "audience",
                    audience_suggestion: decision.audience_suggestion ?? null,
                    source_adset_platform_id: decision.entity_id,
                  })
                } catch (qErr) {
                  console.error("[agent-evaluate] creative_queue audience insert failed", qErr)
                }

                executed = true
                results[platform].actions++
              }
            }
          }

          if (decision.action_taken === "SCALED") {
            const scalePct = Number(agentCfg.budget_scale_pct)
            if (platform === "meta") {
              const adsetsLive = await fetchActiveAdSets()
              const adset = adsetsLive.find((a) => a.id === decision.entity_id)
              if (adset?.daily_budget) {
                const dailyCents = Number(adset.daily_budget)
                const currentDollars = dailyCents / 100
                executed = await scaleAdSetBudget(decision.entity_id, currentDollars, scalePct)
                if (executed) results[platform].actions++
              }
            } else if (decision.campaign_id) {
              const currentMicros = await fetchCampaignBudgetMicros(decision.campaign_id)
              if (currentMicros != null) {
                const newMicros = Math.round(currentMicros * (1 + scalePct))
                executed = await scaleGoogleBudget(decision.campaign_id, newMicros)
                if (executed) results[platform].actions++
              }
            }
          }
        } catch (err) {
          executionError = err instanceof Error ? err.message : "Unknown error"
          results[platform].errors++
          console.error(`[agent-evaluate] Action failed for ${decision.entity_id}`, err)
        }

        const cpaAt = decision.cpa_at_decision
        await supabase.from("agent_decisions").insert({
          entity_type: decision.entity_type,
          entity_id: decision.entity_id,
          entity_name: decision.entity_name,
          parent_entity_id: decision.parent_entity_id ?? null,
          campaign_id: decision.campaign_id ?? null,
          platform: decision.platform,
          goal_type: goalType,
          rule_triggered: decision.rule_triggered,
          spend_at_decision: decision.spend_at_decision,
          cpa_at_decision: Number.isFinite(cpaAt) ? cpaAt : null,
          target_cpa: decision.target_cpa,
          action_taken: decision.action_taken,
          action_executed: executed,
          execution_error: executionError,
          requires_creative: decision.requires_creative,
          creative_brief: decision.creative_brief ?? null,
          ab_duplicate_id: abDuplicateId,
        })

        if (decision.requires_creative && decision.creative_brief) {
          const targetAdset =
            decision.entity_type === "creative"
              ? (decision.parent_entity_id ?? decision.entity_id)
              : decision.entity_id
          await supabase.from("creative_queue").insert({
            platform: decision.platform,
            goal_type: goalType,
            priority: decision.action_taken === "PAUSED" ? "HIGH" : "MEDIUM",
            reason: `${decision.entity_name} paused — ${decision.rule_triggered}`,
            concept: extractConcept(decision.entity_name),
            format: decision.platform === "meta" ? "VID" : "RSA",
            ratio: decision.platform === "meta" ? "9x16" : "—",
            cta: "BookNow",
            copy_suggestion: decision.creative_brief,
            hook_suggestion: generateHookSuggestion(decision.rule_triggered),
            target_adset_id: targetAdset,
            status: "PENDING",
            queue_type: "creative",
            audience_suggestion: decision.audience_suggestion ?? null,
          })
        }
      }

      await supabase
        .from("agent_config")
        .update({ last_run_at: new Date().toISOString(), next_run_at: nextRunUtc() })
        .eq("platform", platform)
        .eq("goal_type", goalType)
    } catch (err) {
      console.error(`[agent-evaluate] Platform error: ${platform}`, err)
      results[platform].errors++
    }
  }

  return NextResponse.json({ ok: true, date, results })
}
