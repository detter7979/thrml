import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/admin"
import type { RecKindT } from "@/types/paid-media"

import { autoApprovalDecision, isAutoApproveMode, maxAutoActionsPerRun } from "./auto-approve"
import { dedupeProposals } from "./dedupe"
import { expireStaleRecommendations } from "./expire"
import { fetchEvaluatorContext } from "./fetch-data"
import { rule01CampaignCacOverTarget } from "./rules/01-campaign-cac-over-target"
import { rule02CampaignBumpBudget } from "./rules/02-campaign-bump-budget"
import { rule03AdCpc3xMedian } from "./rules/03-ad-cpc-3x-median"
import { rule04FrequencySaturation } from "./rules/04-frequency-saturation"
import { rule05PhaseAdvancement } from "./rules/05-phase-advancement"
import { rule06AbTestWinner } from "./rules/06-ab-test-winner"
import { rule07StaleDataCheck } from "./rules/07-stale-data-check"
import { rule08Through10CreativePerformance } from "./rules/08-creative-from-performance"
import { rule09AdSetWastedSpend } from "./rules/09-ad-set-wasted-spend"
import { rule10AudienceTest } from "./rules/10-audience-test"
import type { EvaluatorContext, EvaluatorRunResult, RuleResult } from "./types"
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
  rule09AdSetWastedSpend,
  rule10AudienceTest,
]

function applyFloorAndCap(ctx: { rules: Record<string, unknown> }, proposals: RuleResult[]): RuleResult[] {
  const floor = ruleNumber(ctx.rules, "evaluator", "confidence_floor_for_proposal", 0.55)
  const maxRecs = ruleNumber(ctx.rules, "evaluator", "max_recs_per_run", 25)
  const filtered = proposals.filter((p) => p.confidence >= floor)
  filtered.sort((a, b) => b.confidence - a.confidence)
  return filtered.slice(0, maxRecs)
}

/** If a campaign is being killed or paused, drop the ad set / ad / budget / creative proposals inside it. */
export function suppressUnderStoppedCampaigns(raw: RuleResult[]): RuleResult[] {
  const stopped = new Set(
    raw.filter((p) => (p.kind === "KILL_CAMPAIGN" || p.kind === "PAUSE_CAMPAIGN") && p.target.campaignId).map((p) => p.target.campaignId!)
  )
  if (!stopped.size) return raw
  return raw.filter(
    (p) => p.kind === "KILL_CAMPAIGN" || p.kind === "PAUSE_CAMPAIGN" || !p.target.campaignId || !stopped.has(p.target.campaignId)
  )
}

/** Run every rule on a context (no DB). Used by the evaluator and the admin test scenario. */
export function proposeFromContext(ctx: EvaluatorContext): { raw: RuleResult[]; proposals: RuleResult[] } {
  const raw: RuleResult[] = []
  for (const rule of ALL_RULES) raw.push(...rule(ctx))
  return { raw, proposals: applyFloorAndCap(ctx, dedupeProposals(suppressUnderStoppedCampaigns(raw), ctx.recentRecs)) }
}

async function insertRecommendations(
  admin: SupabaseClient,
  ctx: EvaluatorContext,
  proposals: RuleResult[]
): Promise<{ written: number; autoApproved: number }> {
  const autoMode = isAutoApproveMode(ctx)
  const autoCap = maxAutoActionsPerRun(ctx)
  const expiryHours = ruleNumber(ctx.rules, "global", "rec_expiry_hours", 72)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiryHours * 3_600_000).toISOString()

  let autoApproved = 0
  const rows = proposals.map((p) => {
    const decision = autoApprovalDecision(ctx, p)
    const approve = autoMode && decision.eligible && autoApproved < autoCap
    if (approve) autoApproved++
    return {
      kind: p.kind,
      status: approve ? ("APPROVED" as const) : ("PENDING" as const),
      proposed_by: EXECUTOR,
      target_campaign_id: p.target.campaignId ?? null,
      target_ad_set_id: p.target.adSetId ?? null,
      target_ad_id: p.target.adId ?? null,
      payload: p.payload,
      evidence: { ...p.evidence, auto_approval: decision },
      rationale: p.rationale,
      confidence: Math.round(Math.min(1, Math.max(0, p.confidence)) * 100) / 100,
      auto_approve_eligible: decision.eligible,
      approved_by: approve ? "auto:evaluator" : null,
      approved_at: approve ? now.toISOString() : null,
      expires_at: expiresAt,
    }
  })

  let written = 0
  const chunk = 20
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk)
    const { error } = await admin.from("recommendations").insert(slice)
    if (error) throw new Error(`recommendations insert: ${error.message}`)
    written += slice.length
  }
  return { written, autoApproved }
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
    const expired = dryRun
      ? 0
      : await expireStaleRecommendations(admin, ruleNumber(ctx.rules, "global", "rec_expiry_hours", 72))
    const raw: RuleResult[] = []
    for (const rule of ALL_RULES) {
      raw.push(...rule(ctx))
    }
    const afterDedupe = dedupeProposals(suppressUnderStoppedCampaigns(raw), ctx.recentRecs)
    const capped = applyFloorAndCap(ctx, afterDedupe)

    let written = 0
    let autoApproved = 0
    if (!dryRun && capped.length) {
      ;({ written, autoApproved } = await insertRecommendations(admin, ctx, capped))
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
          auto_approved: autoApproved,
          expired,
          approval_mode: isAutoApproveMode(ctx) ? "AUTO_APPROVE_LOW_STAKES" : "ALL_REQUIRE_APPROVAL",
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
