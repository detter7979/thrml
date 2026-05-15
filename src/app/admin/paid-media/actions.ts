"use server"

import { revalidatePath } from "next/cache"

import { requireAdmin } from "@/lib/admin-guard"
import { insertCreativeBriefFromGenerateCreativeRecommendation } from "@/lib/agent/evaluator/creative-brief-from-recommendation"
import { createAdminClient } from "@/lib/supabase/admin"
import type { ActorT, RecKindT, Recommendation } from "@/types/paid-media"

export type ActionResult = { ok: true } | { ok: false; error: string }

async function insertHumanActionLog(
  admin: ReturnType<typeof createAdminClient>,
  row: Pick<
    Recommendation,
    "id" | "kind" | "target_campaign_id" | "target_ad_set_id" | "target_ad_id"
  >,
  payload: Record<string, unknown>
) {
  const { error } = await admin.from("actions_log").insert({
    recommendation_id: row.id,
    kind: row.kind as RecKindT,
    executed_by: "HUMAN" satisfies ActorT,
    target_campaign_id: row.target_campaign_id,
    target_ad_set_id: row.target_ad_set_id,
    target_ad_id: row.target_ad_id,
    payload,
    success: true,
    error_message: null,
  })
  if (error) throw new Error(error.message)
}

export async function approveRecommendation(id: string): Promise<ActionResult> {
  const { user } = await requireAdmin()
  const admin = createAdminClient()

  const { data: rec, error: fetchError } = await admin
    .from("recommendations")
    .select(
      "id, kind, status, target_campaign_id, target_ad_set_id, target_ad_id, payload, modified_payload, rationale, evidence"
    )
    .eq("id", id)
    .maybeSingle()

  if (fetchError) return { ok: false, error: fetchError.message }
  if (!rec || rec.status !== "PENDING") return { ok: false, error: "Recommendation not found or not pending." }

  const approvedBy = user.email?.trim() || user.id
  const now = new Date().toISOString()

  const effectivePayload =
    rec.modified_payload && typeof rec.modified_payload === "object"
      ? (rec.modified_payload as Record<string, unknown>)
      : (rec.payload as Record<string, unknown>)

  const { error: updateError } = await admin
    .from("recommendations")
    .update({
      status: "APPROVED",
      approved_at: now,
      approved_by: approvedBy,
    })
    .eq("id", id)
    .eq("status", "PENDING")

  if (updateError) return { ok: false, error: updateError.message }

  try {
    if (rec.kind === "GENERATE_CREATIVE") {
      const briefRes = await insertCreativeBriefFromGenerateCreativeRecommendation(admin, rec, effectivePayload)
      if (!briefRes.ok) {
        await admin
          .from("recommendations")
          .update({
            status: "PENDING",
            approved_at: null,
            approved_by: null,
          })
          .eq("id", id)
          .eq("status", "APPROVED")
        return { ok: false, error: briefRes.error }
      }
    }

    await insertHumanActionLog(
      admin,
      {
        id: rec.id,
        kind: rec.kind as RecKindT,
        target_campaign_id: rec.target_campaign_id,
        target_ad_set_id: rec.target_ad_set_id,
        target_ad_id: rec.target_ad_id,
      },
      { action: "approve", payload: effectivePayload }
    )
  } catch (e) {
    await admin
      .from("recommendations")
      .update({
        status: "PENDING",
        approved_at: null,
        approved_by: null,
      })
      .eq("id", id)
      .eq("status", "APPROVED")
    return { ok: false, error: e instanceof Error ? e.message : "Failed to finalize approval." }
  }

  revalidatePath("/admin/paid-media")
  revalidatePath("/admin/paid-media/campaigns")
  revalidatePath("/admin/agents")
  return { ok: true }
}

export async function rejectRecommendation(id: string, reason: string): Promise<ActionResult> {
  const admin = createAdminClient()
  await requireAdmin()

  const trimmed = reason.trim()
  if (!trimmed) return { ok: false, error: "Rejection reason is required." }

  const { data: rec, error: fetchError } = await admin
    .from("recommendations")
    .select("id, kind, status, target_campaign_id, target_ad_set_id, target_ad_id")
    .eq("id", id)
    .maybeSingle()

  if (fetchError) return { ok: false, error: fetchError.message }
  if (!rec || rec.status !== "PENDING") return { ok: false, error: "Recommendation not found or not pending." }

  const { error: updateError } = await admin
    .from("recommendations")
    .update({
      status: "REJECTED",
      rejected_reason: trimmed,
    })
    .eq("id", id)
    .eq("status", "PENDING")

  if (updateError) return { ok: false, error: updateError.message }

  try {
    await insertHumanActionLog(
      admin,
      {
        id: rec.id,
        kind: rec.kind as RecKindT,
        target_campaign_id: rec.target_campaign_id,
        target_ad_set_id: rec.target_ad_set_id,
        target_ad_id: rec.target_ad_id,
      },
      { action: "reject", rejected_reason: trimmed }
    )
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to write actions log." }
  }

  revalidatePath("/admin/paid-media")
  return { ok: true }
}

export async function modifyRecommendation(id: string, newPayload: object): Promise<ActionResult> {
  const admin = createAdminClient()
  await requireAdmin()

  if (newPayload === null || typeof newPayload !== "object" || Array.isArray(newPayload)) {
    return { ok: false, error: "Payload must be a JSON object." }
  }

  const { data: rec, error: fetchError } = await admin
    .from("recommendations")
    .select("id, kind, status, target_campaign_id, target_ad_set_id, target_ad_id")
    .eq("id", id)
    .maybeSingle()

  if (fetchError) return { ok: false, error: fetchError.message }
  if (!rec || rec.status !== "PENDING") return { ok: false, error: "Recommendation not found or not pending." }

  const { error: updateError } = await admin
    .from("recommendations")
    .update({
      modified_payload: newPayload as Record<string, unknown>,
    })
    .eq("id", id)
    .eq("status", "PENDING")

  if (updateError) return { ok: false, error: updateError.message }

  try {
    await insertHumanActionLog(
      admin,
      {
        id: rec.id,
        kind: rec.kind as RecKindT,
        target_campaign_id: rec.target_campaign_id,
        target_ad_set_id: rec.target_ad_set_id,
        target_ad_id: rec.target_ad_id,
      },
      { action: "modify", modified_payload: newPayload as Record<string, unknown> }
    )
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to write actions log." }
  }

  revalidatePath("/admin/paid-media")
  return { ok: true }
}
