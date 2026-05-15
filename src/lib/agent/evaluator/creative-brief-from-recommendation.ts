import type { SupabaseClient } from "@supabase/supabase-js"

import type { Recommendation } from "@/types/paid-media"

import type { CreativeStrategy } from "./creative-payload"

export type BriefFromRecResult = { ok: true; briefId: string } | { ok: false; error: string }

function clampVariations(n: number): 1 | 2 | 3 {
  if (n >= 3) return 3
  if (n === 2) return 2
  return 1
}

/**
 * When a GENERATE_CREATIVE recommendation is approved in paid media queue,
 * insert a pending creative brief wired to performance context for the creative-brief cron + manual approval.
 */
export async function insertCreativeBriefFromGenerateCreativeRecommendation(
  admin: SupabaseClient,
  rec: Pick<
    Recommendation,
    "id" | "target_campaign_id" | "target_ad_set_id" | "target_ad_id" | "rationale" | "evidence"
  >,
  effectivePayload: Record<string, unknown>
): Promise<BriefFromRecResult> {
  const { data: dupe } = await admin
    .from("creative_briefs")
    .select("id")
    .contains("trigger_data", { recommendation_id: rec.id })
    .maybeSingle()

  if (dupe?.id) return { ok: true, briefId: dupe.id as string }

  const campaignId = rec.target_campaign_id
  if (!campaignId) {
    return { ok: false, error: "GENERATE_CREATIVE recommendation is missing target_campaign_id." }
  }

  const { data: campaign, error: cErr } = await admin
    .from("campaigns")
    .select("id, legacy_id, name, persona, service, geo, funnel, event")
    .eq("id", campaignId)
    .maybeSingle()
  if (cErr) return { ok: false, error: cErr.message }
  if (!campaign) return { ok: false, error: "Campaign not found for recommendation." }

  type BriefSourceAdSet = {
    id: string
    legacy_id: string | null
    name: string
    platform_adset_id: string | null
  }

  let adSet: BriefSourceAdSet | null = null
  if (rec.target_ad_set_id) {
    const { data, error } = await admin
      .from("ad_sets")
      .select("id, legacy_id, name, platform_adset_id")
      .eq("id", rec.target_ad_set_id)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    adSet = data as BriefSourceAdSet | null
  }

  type BriefSourceAd = {
    id: string
    legacy_id: string | null
    name: string
    hook_copy: string | null
    angle: string
    format: string
    cta: string
    status: string
    platform_ad_id: string | null
  }

  let ad: BriefSourceAd | null = null
  if (rec.target_ad_id) {
    const { data, error } = await admin
      .from("ads")
      .select("id, legacy_id, name, hook_copy, angle, format, cta, status, platform_ad_id")
      .eq("id", rec.target_ad_id)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    ad = data as BriefSourceAd | null
  }

  const rawVars = effectivePayload.variants
  const variants = Array.isArray(rawVars) ? rawVars.filter((x) => x && typeof x === "object") : []
  const rawVariations = effectivePayload.variations
  const variations = clampVariations(
    typeof rawVariations === "number" && Number.isFinite(rawVariations)
      ? Math.round(rawVariations)
      : variants.length || 3
  )

  const strategy = (effectivePayload.creative_strategy as CreativeStrategy | undefined) ?? "frequency_refresh"
  const messaging_direction =
    typeof effectivePayload.messaging_direction === "string" ? effectivePayload.messaging_direction.trim() : ""

  const campaignShort =
    (typeof campaign.legacy_id === "string" && campaign.legacy_id.trim()) ||
    String(campaign.name ?? "campaign").slice(0, 48)

  const hypothesis =
    (typeof rec.rationale === "string" && rec.rationale.trim()) ||
    `Creative refresh (${strategy}) for ${campaignShort}`

  const hookSeed =
    (ad?.hook_copy?.trim() ||
      messaging_direction ||
      `New ${strategy.replace(/_/g, " ")} iteration for ${campaignShort}`) ??
    `Creative iteration — ${campaignShort}`

  const visualHint =
    typeof effectivePayload.visual_direction_hint === "string"
      ? effectivePayload.visual_direction_hint.trim()
      : ""

  const briefRow = {
    trigger_type: "paid_media_evaluator",
    trigger_data: {
      recommendation_id: rec.id,
      creative_strategy: strategy,
      evaluator_payload: effectivePayload,
      evidence: rec.evidence ?? {},
      variations,
      variants: variants.length ? variants : undefined,
      generator: effectivePayload.generator ?? "both",
      target: {
        campaign_id: campaignId,
        ad_set_id: rec.target_ad_set_id ?? null,
        ad_id: rec.target_ad_id ?? null,
      },
      source_ad: ad
        ? {
            id: ad.id,
            hook_copy: ad.hook_copy,
            angle: ad.angle,
            format: ad.format,
            cta: ad.cta,
            status: ad.status,
            platform_ad_id: ad.platform_ad_id,
            name: ad.name,
          }
        : null,
      source_ad_set: adSet
        ? {
            id: adSet.id,
            name: adSet.name,
            platform_adset_id: adSet.platform_adset_id,
          }
        : null,
    },
    status: "pending" as const,
    hypothesis,
    target_audience: `${campaign.persona} · ${campaign.service} · ${campaign.geo} · ${campaign.funnel}`,
    hook: hookSeed.slice(0, 500),
    format: typeof effectivePayload.format === "string" ? effectivePayload.format : "1x1",
    visual_direction:
      visualHint ||
      (messaging_direction
        ? `${messaging_direction}. On-brand still life or lifestyle, no on-image text; leave room for overlay copy.`
        : `Performance-driven refresh (${strategy}). Cinematic, warm wellness aesthetic; no on-image text.`),
    copy_primary: messaging_direction || hypothesis,
    copy_headline: ad?.hook_copy?.trim() || hookSeed.slice(0, 120),
    copy_subtext: null as string | null,
    cta: ad?.cta ?? "book_now",
    reference_image_urls: [] as string[],
    rationale: rec.rationale ?? null,
    campaign_short_name: campaignShort,
    success_criteria: {
      variations,
      creative_strategy: strategy,
      formats: Array.isArray(effectivePayload.formats) ? effectivePayload.formats : ["1x1"],
      variants: variants.length ? variants : undefined,
    },
    created_by: "EVALUATOR_AGENT",
  }

  const { data: inserted, error: iErr } = await admin.from("creative_briefs").insert(briefRow).select("id").single()
  if (iErr) return { ok: false, error: iErr.message }
  return { ok: true, briefId: inserted.id as string }
}
