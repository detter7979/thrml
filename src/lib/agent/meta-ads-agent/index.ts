/**
 * Meta Ads Agent — Phase A
 *
 * Picks up APPROVED recommendations from the queue and executes them
 * against the Meta Marketing API. Internal-only actions (status changes,
 * budget adjustments) on existing entities.
 *
 * Cron: once daily (see vercel.json; default 11:00 UTC, after evaluator-agent).
 * Audit: writes to meta_executions + actions_log.
 *
 * Future phases:
 *   - Phase B: auto-approval based on rules
 *   - Phase C: creative brief generation, asset push to Meta
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { dispatchExecution } from "./executors"
import { mapRecKindToExecutionKind } from "./kind-mapper"
import type { MetaAgentRunResult, MetaExecutionKind } from "./types"
import type { MetaExecutionKindT, MetaExecutionStatusT, Recommendation } from "@/types/paid-media"

const LOG_KIND = "AGENT_RUN" as const
const EXECUTOR = "META_AGENT" as const

const APPROVED_META_KINDS = [
  "PAUSE_CAMPAIGN",
  "PAUSE_AD_SET",
  "PAUSE_AD",
  "KILL_CAMPAIGN",
  "KILL_AD_SET",
  "KILL_AD",
  "ADJUST_BUDGET",
] as const

const ACTIVE_EXECUTION_STATUSES: MetaExecutionStatusT[] = [
  "pending",
  "in_progress",
  "success",
  "retrying",
]

function effectivePayload(rec: Recommendation): Record<string, unknown> {
  if (rec.modified_payload && typeof rec.modified_payload === "object") {
    return rec.modified_payload as Record<string, unknown>
  }
  return rec.payload
}

/** After failure #failCount (1..3), schedule next retry; 4 = terminal. */
function nextRetryAtIso(failCount: number): string | null {
  if (failCount >= 4) return null
  const ms =
    failCount === 1 ? 60_000 : failCount === 2 ? 5 * 60_000 : failCount === 3 ? 15 * 60_000 : null
  if (ms == null) return null
  return new Date(Date.now() + ms).toISOString()
}

async function resolveMetaIds(
  admin: SupabaseClient,
  rec: Recommendation,
): Promise<{ meta_campaign_id: string | null; meta_adset_id: string | null; meta_ad_id: string | null }> {
  let meta_campaign_id: string | null = null
  let meta_adset_id: string | null = null
  let meta_ad_id: string | null = null
  if (rec.target_campaign_id) {
    const { data } = await admin
      .from("campaigns")
      .select("platform_campaign_id")
      .eq("id", rec.target_campaign_id)
      .maybeSingle()
    meta_campaign_id = (data?.platform_campaign_id as string | null) ?? null
  }
  if (rec.target_ad_set_id) {
    const { data } = await admin
      .from("ad_sets")
      .select("platform_adset_id")
      .eq("id", rec.target_ad_set_id)
      .maybeSingle()
    meta_adset_id = (data?.platform_adset_id as string | null) ?? null
  }
  if (rec.target_ad_id) {
    const { data } = await admin.from("ads").select("platform_ad_id").eq("id", rec.target_ad_id).maybeSingle()
    meta_ad_id = (data?.platform_ad_id as string | null) ?? null
  }
  return { meta_campaign_id, meta_adset_id, meta_ad_id }
}

type ExecutionRow = {
  id: string
  recommendation_id: string | null
  kind: MetaExecutionKindT
  attempt: number | null
  status: MetaExecutionStatusT
  next_retry_at: string | null
}

async function loadRecommendation(admin: SupabaseClient, id: string): Promise<Recommendation | null> {
  const { data, error } = await admin.from("recommendations").select("*").eq("id", id).maybeSingle()
  if (error || !data) return null
  return data as Recommendation
}

async function insertPerRecLog(
  admin: SupabaseClient,
  rec: Recommendation,
  success: boolean,
  payload: Record<string, unknown>,
  errorMessage: string | null,
) {
  await admin.from("actions_log").insert({
    kind: rec.kind,
    executed_by: EXECUTOR,
    recommendation_id: rec.id,
    target_campaign_id: rec.target_campaign_id,
    target_ad_set_id: rec.target_ad_set_id,
    target_ad_id: rec.target_ad_id,
    payload,
    success,
    error_message: errorMessage,
  })
}

async function markRecExecuted(admin: SupabaseClient, recId: string, actionLogId: string | null) {
  await admin
    .from("recommendations")
    .update({
      status: "EXECUTED",
      executed_by_action_id: actionLogId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recId)
}

export async function runMetaAdsAgent(
  admin: SupabaseClient,
  opts: { maxRecsPerRun?: number; dryRun?: boolean } = {},
): Promise<MetaAgentRunResult> {
  const t0 = Date.now()
  const maxRecsPerRun = opts.maxRecsPerRun ?? 10
  const dryRun = opts.dryRun === true
  let processed = 0
  let succeeded = 0
  let failed = 0

  const { data: runInsert, error: runErr } = await admin
    .from("actions_log")
    .insert({
      kind: LOG_KIND,
      executed_by: EXECUTOR,
      recommendation_id: null,
      target_campaign_id: null,
      target_ad_set_id: null,
      target_ad_id: null,
      payload: { run_type: "meta_executor", dry_run: dryRun },
      success: false,
    })
    .select("id")
    .single()

  if (runErr || !runInsert?.id) {
    return {
      ok: false,
      runId: null,
      error: runErr?.message ?? "Failed to create actions_log run",
      processed: 0,
      succeeded: 0,
      failed: 0,
      dry_run: dryRun,
      duration_ms: Date.now() - t0,
    }
  }

  const runId = runInsert.id as string

  try {
    const { data: retryRows, error: retryErr } = await admin
      .from("meta_executions")
      .select("id, recommendation_id, kind, attempt, status, next_retry_at")
      .eq("status", "retrying")
      .lte("next_retry_at", new Date().toISOString())
      .order("next_retry_at", { ascending: true })
      .limit(5)

    if (retryErr) throw new Error(retryErr.message)

    const { data: candidates, error: candErr } = await admin
      .from("recommendations")
      .select("*")
      .eq("status", "APPROVED")
      .in("kind", [...APPROVED_META_KINDS])
      .order("approved_at", { ascending: true, nullsFirst: false })
      .limit(80)

    if (candErr) throw new Error(candErr.message)

    const candList = (candidates ?? []) as Recommendation[]
    const candIds = candList.map((c) => c.id)
    const { data: execSnap } =
      candIds.length > 0
        ? await admin.from("meta_executions").select("recommendation_id, status").in("recommendation_id", candIds)
        : { data: [] as { recommendation_id: string; status: string }[] }

    const busy = new Set<string>()
    const terminalFailed = new Set<string>()
    for (const e of execSnap ?? []) {
      const rid = e.recommendation_id as string
      if (!rid) continue
      if (ACTIVE_EXECUTION_STATUSES.includes(e.status as MetaExecutionStatusT)) busy.add(rid)
      if (e.status === "failed") terminalFailed.add(rid)
    }

    const freshRecs = candList
      .filter((r) => !busy.has(r.id) && !terminalFailed.has(r.id))
      .slice(0, maxRecsPerRun)

    type WorkItem = { mode: "retry"; exec: ExecutionRow } | { mode: "new"; exec: ExecutionRow; rec: Recommendation }

    const queue: WorkItem[] = []

    for (const r of retryRows ?? []) {
      queue.push({ mode: "retry", exec: r as ExecutionRow })
    }

    for (const rec of freshRecs) {
      const mapped = mapRecKindToExecutionKind(rec)
      if (!mapped) continue
      const metaIds = await resolveMetaIds(admin, rec)
      const { data: inserted, error: insErr } = await admin
        .from("meta_executions")
        .insert({
          source: "approved_recommendation",
          recommendation_id: rec.id,
          kind: mapped,
          target_campaign_id: rec.target_campaign_id,
          target_ad_set_id: rec.target_ad_set_id,
          target_ad_id: rec.target_ad_id,
          meta_campaign_id: metaIds.meta_campaign_id,
          meta_adset_id: metaIds.meta_adset_id,
          meta_ad_id: metaIds.meta_ad_id,
          request_payload: {
            recommendation_kind: rec.kind,
            targets: {
              target_campaign_id: rec.target_campaign_id,
              target_ad_set_id: rec.target_ad_set_id,
              target_ad_id: rec.target_ad_id,
            },
            payload: effectivePayload(rec),
          },
          response_payload: null,
          http_status: null,
          status: "pending" as MetaExecutionStatusT,
          attempt: 0,
          error_message: null,
          started_at: new Date().toISOString(),
          completed_at: null,
          next_retry_at: null,
        })
        .select("id, recommendation_id, kind, attempt, status, next_retry_at")
        .single()

      if (insErr) {
        if (insErr.code === "23505") continue
        throw new Error(insErr.message)
      }
      if (!inserted) continue

      queue.push({
        mode: "new",
        exec: inserted as ExecutionRow,
        rec,
      })
    }

    for (const item of queue) {
      const exec = item.exec
      const rec =
        item.mode === "retry"
          ? exec.recommendation_id
            ? await loadRecommendation(admin, exec.recommendation_id)
            : null
          : item.rec

      if (!rec) {
        await admin
          .from("meta_executions")
          .update({
            status: "failed",
            error_message: "Recommendation not found",
            completed_at: new Date().toISOString(),
          })
          .eq("id", exec.id)
        processed++
        failed++
        continue
      }

      processed++

      if (dryRun) {
        await admin
          .from("meta_executions")
          .update({
            status: "success",
            response_payload: { dry_run: true },
            http_status: null,
            completed_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", exec.id)
        await insertPerRecLog(admin, rec, true, { meta_execution_id: exec.id, dry_run: true }, null)
        succeeded++
        continue
      }

      await admin.from("meta_executions").update({ status: "in_progress" }).eq("id", exec.id)

      const result = await dispatchExecution(exec.kind as MetaExecutionKind, rec, admin)

      if (result.success) {
        await admin
          .from("meta_executions")
          .update({
            status: "success",
            response_payload: (result.meta_response ?? { ok: true }) as Record<string, unknown>,
            http_status: result.http_status ?? null,
            completed_at: new Date().toISOString(),
            error_message: null,
            next_retry_at: null,
          })
          .eq("id", exec.id)

        const { data: logRow } = await admin
          .from("actions_log")
          .insert({
            kind: rec.kind,
            executed_by: EXECUTOR,
            recommendation_id: rec.id,
            target_campaign_id: rec.target_campaign_id,
            target_ad_set_id: rec.target_ad_set_id,
            target_ad_id: rec.target_ad_id,
            payload: { meta_execution_id: exec.id, http_status: result.http_status },
            success: true,
            error_message: null,
          })
          .select("id")
          .single()

        await markRecExecuted(admin, rec.id, (logRow?.id as string) ?? null)
        succeeded++
      } else {
        const errMsg = result.error ?? "Unknown Meta error"
        const prevFails = exec.attempt ?? 0
        const failCount = prevFails + 1

        if (failCount >= 4) {
          await admin
            .from("meta_executions")
            .update({
              status: "failed",
              attempt: failCount,
              error_message: errMsg,
              response_payload: (result.meta_response ?? null) as Record<string, unknown> | null,
              http_status: result.http_status ?? null,
              completed_at: new Date().toISOString(),
              next_retry_at: null,
            })
            .eq("id", exec.id)

          await admin.from("actions_log").insert({
            kind: LOG_KIND,
            executed_by: EXECUTOR,
            recommendation_id: rec.id,
            target_campaign_id: rec.target_campaign_id,
            target_ad_set_id: rec.target_ad_set_id,
            target_ad_id: rec.target_ad_id,
            payload: {
              run_type: "meta_executor_fatal",
              meta_execution_id: exec.id,
              attempts: failCount,
            },
            success: false,
            error_message: errMsg,
          })

          await insertPerRecLog(
            admin,
            rec,
            false,
            { meta_execution_id: exec.id, http_status: result.http_status },
            errMsg,
          )
        } else {
          const nra = nextRetryAtIso(failCount)
          await admin
            .from("meta_executions")
            .update({
              status: "retrying",
              attempt: failCount,
              error_message: errMsg,
              response_payload: (result.meta_response ?? null) as Record<string, unknown> | null,
              http_status: result.http_status ?? null,
              next_retry_at: nra,
              completed_at: null,
            })
            .eq("id", exec.id)

          await insertPerRecLog(
            admin,
            rec,
            false,
            { meta_execution_id: exec.id, http_status: result.http_status, retrying: true },
            errMsg,
          )
        }
        failed++
      }
    }

    const duration_ms = Date.now() - t0
    await admin
      .from("actions_log")
      .update({
        success: true,
        error_message: null,
        payload: {
          run_type: "meta_executor",
          dry_run: dryRun,
          processed,
          succeeded,
          failed,
          duration_ms,
        },
      })
      .eq("id", runId)

    return {
      ok: true,
      runId,
      processed,
      succeeded,
      failed,
      dry_run: dryRun,
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
          run_type: "meta_executor",
          dry_run: dryRun,
          processed,
          succeeded,
          failed,
          duration_ms: Date.now() - t0,
        },
      })
      .eq("id", runId)

    return {
      ok: false,
      runId,
      error: msg,
      processed,
      succeeded,
      failed,
      dry_run: dryRun,
      duration_ms: Date.now() - t0,
    }
  }
}
