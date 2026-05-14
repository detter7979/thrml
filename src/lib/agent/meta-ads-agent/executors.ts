import type { SupabaseClient } from "@supabase/supabase-js"

import {
  pauseAdMutation,
  pauseAdSetMutation,
  pauseCampaign,
  setAdSetDailyBudgetUsd,
  setCampaignDailyBudgetUsd,
} from "@/lib/agent/meta-api"
import type { Recommendation } from "@/types/paid-media"

import type { ExecutorResult, MetaExecutionKind } from "./types"

function effectivePayload(rec: Recommendation): Record<string, unknown> {
  if (rec.modified_payload && typeof rec.modified_payload === "object") {
    return rec.modified_payload as Record<string, unknown>
  }
  return rec.payload
}

function metaErrorMessage(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error?: { message?: string } }).error
    if (e?.message) return e.message
  }
  return typeof body === "string" ? body.slice(0, 500) : "Meta API error"
}

function toRecord(body: unknown): Record<string, unknown> | undefined {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>
  return undefined
}

function readBudgetUsd(payload: Record<string, unknown>): number | null {
  const v = payload.new_daily_budget_usd
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export async function executePauseCampaign(rec: Recommendation, admin: SupabaseClient): Promise<ExecutorResult> {
  const cid = rec.target_campaign_id
  if (!cid) return { success: false, error: "Missing target_campaign_id" }
  try {
    const { data: row, error } = await admin
      .from("campaigns")
      .select("id, platform_campaign_id")
      .eq("id", cid)
      .maybeSingle()
    if (error || !row) return { success: false, error: error?.message ?? "Campaign not found" }
    const metaId = row.platform_campaign_id as string | null
    if (!metaId?.trim()) return { success: false, error: "Campaign has no platform_campaign_id" }
    const r = await pauseCampaign(metaId)
    if (!r.ok) {
      return {
        success: false,
        http_status: r.http_status,
        meta_response: toRecord(r.body),
        error: metaErrorMessage(r.body),
      }
    }
    await admin.from("campaigns").update({ status: "PAUSED", paused_at: new Date().toISOString() }).eq("id", cid)
    return { success: true, http_status: r.http_status, meta_response: toRecord(r.body) }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function executeKillCampaign(rec: Recommendation, admin: SupabaseClient): Promise<ExecutorResult> {
  const cid = rec.target_campaign_id
  if (!cid) return { success: false, error: "Missing target_campaign_id" }
  try {
    const { data: row, error } = await admin
      .from("campaigns")
      .select("id, platform_campaign_id")
      .eq("id", cid)
      .maybeSingle()
    if (error || !row) return { success: false, error: error?.message ?? "Campaign not found" }
    const metaId = row.platform_campaign_id as string | null
    if (!metaId?.trim()) return { success: false, error: "Campaign has no platform_campaign_id" }
    const r = await pauseCampaign(metaId)
    if (!r.ok) {
      return {
        success: false,
        http_status: r.http_status,
        meta_response: toRecord(r.body),
        error: metaErrorMessage(r.body),
      }
    }
    await admin.from("campaigns").update({ status: "KILLED", killed_at: new Date().toISOString() }).eq("id", cid)
    return { success: true, http_status: r.http_status, meta_response: toRecord(r.body) }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function executeKillAdSet(rec: Recommendation, admin: SupabaseClient): Promise<ExecutorResult> {
  const sid = rec.target_ad_set_id
  if (!sid) return { success: false, error: "Missing target_ad_set_id" }
  try {
    const { data: row, error } = await admin.from("ad_sets").select("id, platform_adset_id").eq("id", sid).maybeSingle()
    if (error || !row) return { success: false, error: error?.message ?? "Ad set not found" }
    const metaId = row.platform_adset_id as string | null
    if (!metaId?.trim()) return { success: false, error: "Ad set has no platform_adset_id" }
    const r = await pauseAdSetMutation(metaId)
    if (!r.ok) {
      return {
        success: false,
        http_status: r.http_status,
        meta_response: toRecord(r.body),
        error: metaErrorMessage(r.body),
      }
    }
    await admin.from("ad_sets").update({ status: "KILLED", killed_at: new Date().toISOString() }).eq("id", sid)
    return { success: true, http_status: r.http_status, meta_response: toRecord(r.body) }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function executeKillAd(rec: Recommendation, admin: SupabaseClient): Promise<ExecutorResult> {
  const aid = rec.target_ad_id
  if (!aid) return { success: false, error: "Missing target_ad_id" }
  try {
    const { data: row, error } = await admin.from("ads").select("id, platform_ad_id").eq("id", aid).maybeSingle()
    if (error || !row) return { success: false, error: error?.message ?? "Ad not found" }
    const metaId = row.platform_ad_id as string | null
    if (!metaId?.trim()) return { success: false, error: "Ad has no platform_ad_id" }
    const r = await pauseAdMutation(metaId)
    if (!r.ok) {
      return {
        success: false,
        http_status: r.http_status,
        meta_response: toRecord(r.body),
        error: metaErrorMessage(r.body),
      }
    }
    await admin.from("ads").update({ status: "KILLED", killed_at: new Date().toISOString() }).eq("id", aid)
    return { success: true, http_status: r.http_status, meta_response: toRecord(r.body) }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function executePauseAdSet(rec: Recommendation, admin: SupabaseClient): Promise<ExecutorResult> {
  const sid = rec.target_ad_set_id
  if (!sid) return { success: false, error: "Missing target_ad_set_id" }
  try {
    const { data: row, error } = await admin.from("ad_sets").select("id, platform_adset_id").eq("id", sid).maybeSingle()
    if (error || !row) return { success: false, error: error?.message ?? "Ad set not found" }
    const metaId = row.platform_adset_id as string | null
    if (!metaId?.trim()) return { success: false, error: "Ad set has no platform_adset_id" }
    const r = await pauseAdSetMutation(metaId)
    if (!r.ok) {
      return {
        success: false,
        http_status: r.http_status,
        meta_response: toRecord(r.body),
        error: metaErrorMessage(r.body),
      }
    }
    await admin.from("ad_sets").update({ status: "PAUSED", paused_at: new Date().toISOString() }).eq("id", sid)
    return { success: true, http_status: r.http_status, meta_response: toRecord(r.body) }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function executePauseAd(rec: Recommendation, admin: SupabaseClient): Promise<ExecutorResult> {
  const aid = rec.target_ad_id
  if (!aid) return { success: false, error: "Missing target_ad_id" }
  try {
    const { data: row, error } = await admin.from("ads").select("id, platform_ad_id").eq("id", aid).maybeSingle()
    if (error || !row) return { success: false, error: error?.message ?? "Ad not found" }
    const metaId = row.platform_ad_id as string | null
    if (!metaId?.trim()) return { success: false, error: "Ad has no platform_ad_id" }
    const r = await pauseAdMutation(metaId)
    if (!r.ok) {
      return {
        success: false,
        http_status: r.http_status,
        meta_response: toRecord(r.body),
        error: metaErrorMessage(r.body),
      }
    }
    await admin.from("ads").update({ status: "PAUSED", paused_at: new Date().toISOString() }).eq("id", aid)
    return { success: true, http_status: r.http_status, meta_response: toRecord(r.body) }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function executeAdjustCampaignBudget(rec: Recommendation, admin: SupabaseClient): Promise<ExecutorResult> {
  const cid = rec.target_campaign_id
  if (!cid) return { success: false, error: "Missing target_campaign_id" }
  const payload = effectivePayload(rec)
  const usd = readBudgetUsd(payload)
  if (usd == null) return { success: false, error: "Missing or invalid payload.new_daily_budget_usd" }
  try {
    const { data: row, error } = await admin
      .from("campaigns")
      .select("id, platform_campaign_id")
      .eq("id", cid)
      .maybeSingle()
    if (error || !row) return { success: false, error: error?.message ?? "Campaign not found" }
    const metaId = row.platform_campaign_id as string | null
    if (!metaId?.trim()) return { success: false, error: "Campaign has no platform_campaign_id" }
    const r = await setCampaignDailyBudgetUsd(metaId, usd)
    if (!r.ok) {
      return {
        success: false,
        http_status: r.http_status,
        meta_response: toRecord(r.body),
        error: metaErrorMessage(r.body),
      }
    }
    await admin.from("campaigns").update({ daily_budget_usd: usd }).eq("id", cid)
    return { success: true, http_status: r.http_status, meta_response: toRecord(r.body) }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function executeAdjustAdSetBudget(rec: Recommendation, admin: SupabaseClient): Promise<ExecutorResult> {
  const sid = rec.target_ad_set_id
  if (!sid) return { success: false, error: "Missing target_ad_set_id" }
  const payload = effectivePayload(rec)
  const usd = readBudgetUsd(payload)
  if (usd == null) return { success: false, error: "Missing or invalid payload.new_daily_budget_usd" }
  try {
    const { data: row, error } = await admin.from("ad_sets").select("id, platform_adset_id").eq("id", sid).maybeSingle()
    if (error || !row) return { success: false, error: error?.message ?? "Ad set not found" }
    const metaId = row.platform_adset_id as string | null
    if (!metaId?.trim()) return { success: false, error: "Ad set has no platform_adset_id" }
    const r = await setAdSetDailyBudgetUsd(metaId, usd)
    if (!r.ok) {
      return {
        success: false,
        http_status: r.http_status,
        meta_response: toRecord(r.body),
        error: metaErrorMessage(r.body),
      }
    }
    return { success: true, http_status: r.http_status, meta_response: toRecord(r.body) }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function dispatchExecution(
  kind: MetaExecutionKind,
  rec: Recommendation,
  admin: SupabaseClient,
): Promise<ExecutorResult> {
  switch (kind) {
    case "pause_campaign":
      return executePauseCampaign(rec, admin)
    case "kill_campaign":
      return executeKillCampaign(rec, admin)
    case "pause_ad_set":
      return executePauseAdSet(rec, admin)
    case "kill_ad_set":
      return executeKillAdSet(rec, admin)
    case "pause_ad":
      return executePauseAd(rec, admin)
    case "kill_ad":
      return executeKillAd(rec, admin)
    case "adjust_campaign_budget":
      return executeAdjustCampaignBudget(rec, admin)
    case "adjust_ad_set_budget":
      return executeAdjustAdSetBudget(rec, admin)
    default:
      return { success: false, error: `Unsupported execution kind: ${String(kind)}` }
  }
}
