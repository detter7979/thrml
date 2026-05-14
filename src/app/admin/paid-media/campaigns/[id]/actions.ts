"use server"

import { revalidatePath } from "next/cache"

import { requireAdmin } from "@/lib/admin-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import type { RecKindT } from "@/types/paid-media"

export type ActionResult = { ok: true } | { ok: false; error: string }

export type LaunchBulkItemResult = { id: string; ok: true } | { id: string; ok: false; error: string }

export type LaunchBulkResult = { ok: true; results: LaunchBulkItemResult[] } | { ok: false; error: string }

/** rec_kind_t has no AGENT_RUN; LAUNCH_TEST is used for manual “push to Meta TEST” audit rows. */
const LAUNCH_LOG_KIND = "LAUNCH_TEST" satisfies RecKindT

function isValidMetaNumericId(raw: string, minLen = 12, maxLen = 20): boolean {
  const s = raw.trim()
  if (!/^\d+$/.test(s)) return false
  return s.length >= minLen && s.length <= maxLen
}

async function insertLaunchLog(
  admin: ReturnType<typeof createAdminClient>,
  row: {
    target_campaign_id: string | null
    target_ad_set_id: string | null
    target_ad_id: string | null
    payload: Record<string, unknown>
  }
) {
  const { error } = await admin.from("actions_log").insert({
    recommendation_id: null,
    kind: LAUNCH_LOG_KIND,
    executed_by: "HUMAN",
    target_campaign_id: row.target_campaign_id,
    target_ad_set_id: row.target_ad_set_id,
    target_ad_id: row.target_ad_id,
    payload: row.payload,
    platform_request: null,
    platform_response: null,
    success: true,
    error_message: null,
  })
  if (error) throw new Error(error.message)
}

export async function launchCampaign(
  campaignId: string,
  payload: { platformCampaignId: string; dailyBudget?: number; metaName?: string }
): Promise<ActionResult> {
  await requireAdmin()
  const admin = createAdminClient()

  if (!isValidMetaNumericId(payload.platformCampaignId)) {
    return { ok: false, error: "Meta Campaign ID must be digits only, 12–20 characters." }
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await admin
    .from("campaigns")
    .update({
      status: "TEST",
      platform_campaign_id: payload.platformCampaignId.trim(),
      launched_at: now,
      updated_at: now,
    })
    .eq("id", campaignId)
    .eq("status", "DRAFT")
    .select("id")
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!updated) return { ok: false, error: "Campaign not in DRAFT status." }

  try {
    await insertLaunchLog(admin, {
      target_campaign_id: campaignId,
      target_ad_set_id: null,
      target_ad_id: null,
      payload: {
        event: "campaign_launched",
        platform_campaign_id: payload.platformCampaignId.trim(),
        daily_budget: payload.dailyBudget ?? null,
        meta_name: payload.metaName ?? null,
      },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to write actions log." }
  }

  revalidatePath("/admin/paid-media/campaigns")
  revalidatePath(`/admin/paid-media/campaigns/${campaignId}`)
  return { ok: true }
}

export async function launchAdSet(adSetId: string, payload: { platformAdSetId: string }): Promise<ActionResult> {
  await requireAdmin()
  const admin = createAdminClient()

  if (!isValidMetaNumericId(payload.platformAdSetId)) {
    return { ok: false, error: "Meta Ad Set ID must be digits only, 12–20 characters." }
  }

  const { data: row, error: fetchError } = await admin
    .from("ad_sets")
    .select("id, campaign_id, status")
    .eq("id", adSetId)
    .maybeSingle()

  if (fetchError) return { ok: false, error: fetchError.message }
  if (!row) return { ok: false, error: "Ad set not found." }
  if (row.status !== "DRAFT") return { ok: false, error: "Ad set not in DRAFT status." }

  const now = new Date().toISOString()
  const { data: updated, error } = await admin
    .from("ad_sets")
    .update({
      status: "TEST",
      platform_adset_id: payload.platformAdSetId.trim(),
      launched_at: now,
      updated_at: now,
    })
    .eq("id", adSetId)
    .eq("status", "DRAFT")
    .select("id")
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!updated) return { ok: false, error: "Ad set not in DRAFT status." }

  try {
    await insertLaunchLog(admin, {
      target_campaign_id: row.campaign_id,
      target_ad_set_id: adSetId,
      target_ad_id: null,
      payload: {
        event: "ad_set_launched",
        platform_adset_id: payload.platformAdSetId.trim(),
      },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to write actions log." }
  }

  revalidatePath("/admin/paid-media/campaigns")
  revalidatePath(`/admin/paid-media/campaigns/${row.campaign_id}`)
  return { ok: true }
}

export async function launchAd(adId: string, payload: { platformAdId: string }): Promise<ActionResult> {
  await requireAdmin()
  const admin = createAdminClient()

  if (!isValidMetaNumericId(payload.platformAdId)) {
    return { ok: false, error: "Meta Ad ID must be digits only, 12–20 characters." }
  }

  const { data: row, error: fetchError } = await admin
    .from("ads")
    .select("id, campaign_id, ad_set_id, status")
    .eq("id", adId)
    .maybeSingle()

  if (fetchError) return { ok: false, error: fetchError.message }
  if (!row) return { ok: false, error: "Ad not found." }
  if (row.status !== "DRAFT") return { ok: false, error: "Ad not in DRAFT status." }

  const now = new Date().toISOString()
  const { data: updated, error } = await admin
    .from("ads")
    .update({
      status: "TEST",
      platform_ad_id: payload.platformAdId.trim(),
      launched_at: now,
      updated_at: now,
    })
    .eq("id", adId)
    .eq("status", "DRAFT")
    .select("id")
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!updated) return { ok: false, error: "Ad not in DRAFT status." }

  try {
    await insertLaunchLog(admin, {
      target_campaign_id: row.campaign_id,
      target_ad_set_id: row.ad_set_id,
      target_ad_id: adId,
      payload: {
        event: "ad_launched",
        platform_ad_id: payload.platformAdId.trim(),
      },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to write actions log." }
  }

  revalidatePath("/admin/paid-media/campaigns")
  revalidatePath(`/admin/paid-media/campaigns/${row.campaign_id}`)
  return { ok: true }
}

export async function launchAllAdSetsForCampaign(
  campaignId: string,
  platformIds: Array<{ id: string; platformId: string }>
): Promise<LaunchBulkResult> {
  await requireAdmin()
  const admin = createAdminClient()
  const uniqueIds = [...new Set(platformIds.map((p) => p.id))]
  if (!uniqueIds.length) return { ok: false, error: "No ad sets to update." }

  const { data: owned, error: ownErr } = await admin
    .from("ad_sets")
    .select("id")
    .eq("campaign_id", campaignId)
    .in("id", uniqueIds)

  if (ownErr) return { ok: false, error: ownErr.message }
  const ownedSet = new Set((owned ?? []).map((r) => r.id))
  for (const id of uniqueIds) {
    if (!ownedSet.has(id)) return { ok: false, error: `Ad set ${id} is not on this campaign.` }
  }

  const results: LaunchBulkItemResult[] = []

  for (const { id, platformId } of platformIds) {
    const r = await launchAdSet(id, { platformAdSetId: platformId })
    if (r.ok) results.push({ id, ok: true })
    else results.push({ id, ok: false, error: r.error })
  }

  return { ok: true, results }
}

export async function launchAllAdsForAdSet(
  adSetId: string,
  platformIds: Array<{ id: string; platformId: string }>
): Promise<LaunchBulkResult> {
  await requireAdmin()
  const admin = createAdminClient()
  const uniqueIds = [...new Set(platformIds.map((p) => p.id))]
  if (!uniqueIds.length) return { ok: false, error: "No ads to update." }

  const { data: owned, error: ownErr } = await admin
    .from("ads")
    .select("id")
    .eq("ad_set_id", adSetId)
    .in("id", uniqueIds)

  if (ownErr) return { ok: false, error: ownErr.message }
  const ownedSet = new Set((owned ?? []).map((r) => r.id))
  for (const id of uniqueIds) {
    if (!ownedSet.has(id)) return { ok: false, error: `Ad ${id} is not on this ad set.` }
  }

  const results: LaunchBulkItemResult[] = []

  for (const { id, platformId } of platformIds) {
    const r = await launchAd(id, { platformAdId: platformId })
    if (r.ok) results.push({ id, ok: true })
    else results.push({ id, ok: false, error: r.error })
  }

  return { ok: true, results }
}

export async function launchCampaignFromForm(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const campaignId = String(formData.get("campaignId") ?? "").trim()
  if (!campaignId) return { ok: false, error: "Missing campaign id." }

  const platformCampaignId = String(formData.get("platformCampaignId") ?? "").trim()
  const metaNameRaw = formData.get("metaName")
  const metaName =
    metaNameRaw === null || metaNameRaw === undefined ? undefined : String(metaNameRaw).trim() || undefined
  const dailyBudgetRaw = formData.get("dailyBudget")
  let dailyBudget: number | undefined
  if (dailyBudgetRaw !== null && String(dailyBudgetRaw).trim() !== "") {
    const n = Number(dailyBudgetRaw)
    if (Number.isNaN(n)) return { ok: false, error: "Daily budget must be a number." }
    dailyBudget = n
  }

  return launchCampaign(campaignId, { platformCampaignId, dailyBudget, metaName })
}

export async function launchAdSetFromForm(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const adSetId = String(formData.get("adSetId") ?? "").trim()
  if (!adSetId) return { ok: false, error: "Missing ad set id." }
  const platformAdSetId = String(formData.get("platformAdSetId") ?? "").trim()
  return launchAdSet(adSetId, { platformAdSetId })
}

export async function launchAdFromForm(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const adId = String(formData.get("adId") ?? "").trim()
  if (!adId) return { ok: false, error: "Missing ad id." }
  const platformAdId = String(formData.get("platformAdId") ?? "").trim()
  return launchAd(adId, { platformAdId })
}
