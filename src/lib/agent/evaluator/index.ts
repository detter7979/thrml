import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/admin"
import type { RecKindT } from "@/types/paid-media"

import { dedupeProposals } from "./dedupe"
import { fetchEvaluatorContext } from "./fetch-data"
import { rule01CampaignCacOverTarget } from "./rules/01-campaign-cac-over-target"
import { rule02CampaignBumpBudget } from "./rules/02-campaign-bump-budget"
import { rule03AdCpc3xMedian } from "./rules/03-ad-cpc-3x-median"
import { rule04FrequencySaturation } from "./rules/04-frequency-saturation"
import { rule05PhaseAdvancement } from "./rules/05-phase-advancement"
import { rule06AbTestWinner } from "./rules/06-ab-test-winner"
import { rule07StaleDataCheck } from "./rules/07-stale-data-check"
import { rule08Through10CreativePerformance } from "./rules/08-creative-from-performance"
import type { EvaluatorRunResult, RuleResult } from "./types"
import { ruleNumber } from "./types"

const LOG_KIND = "AGENT_RUN" as RecKindT
const EXECUTOR = "EVALUATOR_AGENT" as const

const ALL_RULES = [
  rule01CampaignCacOverTarget,
  rule02CampaignBumpBudget,
  rule03AdCpc3xMedian,
  rule04FrequencySaturation,
  rule05PhaseAdvancement,
  rule06AbTestWinner,
  rule07StaleDataCheck,
  rule08Through10CreativePerformance,
]

function applyFloorAndCap(ctx: { rules: Record<string, unknown> }, proposals: RuleResult[]): RuleResult[] {
  const floor = ruleNumber(ctx.rules, "evaluator", "confidence_floor_for_proposal", 0.55)
  const maxRecs = ruleNumber(ctx.rules, "evaluator", "max_recs_per_run", 25)
  const filtered = proposals.filter((p) => p.confidence >= floor)
  filtered.sort((a, b) => b.confidence - a.confidence)
  return filtered.slice(0, maxRecs)
}

async function insertRecommendations(admin: SupabaseClient, proposals: RuleResult[]): Promise<number> {
  let n = 0
  const chunk = 20
  for (let i = 0; i < proposals.length; i += chunk) {
    const slice = proposals.slice(i, i + chunk).map((p) => ({
      kind: p.kind,
      status: "PENDING" as const,
      proposed_by: EXECUTOR,
      target_campaign_id: p.target.campaignId ?? null,
      target_ad_set_id: p.target.adSetId ?? null,
      target_ad_id: p.target.adId ?? null,
      payload: p.payload,
      evidence: p.evidence,
      rationale: p.rationale,
      confidence: Math.round(Math.min(1, Math.max(0, p.confidence)) * 100) / 100,
      auto_approve_eligible: false,
    }))
    const { error } = await admin.from("recommendations").insert(slice)
    if (error) throw new Error(`recommendations insert: ${error.message}`)
    n += slice.length
  }
  return n
}

export async function runEvaluator(opts: { dryRun?: boolean }): Promise<EvaluatorRunResult> {
  const dryRun = Boolean(opts.dryRun)
  const admin = createAdminClient()
  const t0 = Date.now()

  const { data: runInsert, error: runErr } = await admin
    .from("actions_log")
    .insert({
      kind: LOG_KIND,
      executed_by: EXECUTOR,
      recommendation_id: null,
      target_campaign_id: null,
      target_ad_set_id: null,
      target_ad_id: null,
      payload: {
        run_type: "evaluator",
        dry_run: dryRun,
      },
      success: false,
      error_message: null,
    })
    .select("id")
    .single()

  if (runErr || !runInsert?.id) {
    return {
      ok: false,
      runId: null,
      error: runErr?.message ?? "Failed to create actions_log run",
      dryRun,
      proposalsRaw: 0,
      proposalsAfterDedupe: 0,
      proposalsWritten: 0,
      proposals: [],
      duration_ms: Date.now() - t0,
    }
  }

  const runId = runInsert.id as string

  try {
    const ctx = await fetchEvaluatorContext()
    const raw: RuleResult[] = []
    for (const rule of ALL_RULES) {
      raw.push(...rule(ctx))
    }
    const afterDedupe = dedupeProposals(raw, ctx.recentRecs)
    const capped = applyFloorAndCap(ctx, afterDedupe)

    let written = 0
    if (!dryRun && capped.length) {
      written = await insertRecommendations(admin, capped)
    }

    const duration_ms = Date.now() - t0
    await admin
      .from("actions_log")
      .update({
        success: true,
        error_message: null,
        payload: {
          run_type: "evaluator",
          dry_run: dryRun,
          proposals_generated: raw.length,
          proposals_after_dedupe: afterDedupe.length,
          proposals_after_floor_cap: capped.length,
          proposals_written: written,
          duration_ms,
        },
      })
      .eq("id", runId)

    return {
      ok: true,
      runId,
      dryRun,
      proposalsRaw: raw.length,
      proposalsAfterDedupe: afterDedupe.length,
      proposalsWritten: written,
      proposals: capped,
      duration_ms,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await admin
      .from("actions_log")
      .update({
        success: false,
        error_message: msg,
        payload: {
          run_type: "evaluator",
          dry_run: dryRun,
          duration_ms: Date.now() - t0,
        },
      })
      .eq("id", runId)

    return {
      ok: false,
      runId,
      error: msg,
      dryRun,
      proposalsRaw: 0,
      proposalsAfterDedupe: 0,
      proposalsWritten: 0,
      proposals: [],
      duration_ms: Date.now() - t0,
    }
  }
}
