import type { SupabaseClient } from "@supabase/supabase-js"

import type { Recommendation } from "@/types/paid-media"

import type { CreativeStrategy } from "./creative-payload"
import { nextTestId } from "./next-test-id"

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
    test_id: string | null
    gcs_path: string | null
  }

  let ad: BriefSourceAd | null = null
  if (rec.target_ad_id) {
    const { data, error } = await admin
      .from("ads")
      .select("id, legacy_id, name, hook_copy, angle, format, cta, status, platform_ad_id, test_id, gcs_path")
      .eq("id", rec.target_ad_id)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    ad = data as BriefSourceAd | null
  }

  // The brief that produced the source ad's creative (matched by its GCS path). When it's an SVG
  // template brief, the iteration reuses its template, photo, sizes and copy so it lands in the same
  // pipeline flow (preview → build sizes → launch) instead of a bare 1x1 Imagen brief.
  type SourceBrief = {
    id: string
    format: string | null
    copy_primary: string | null
    copy_headline: string | null
    copy_subtext: string | null
    cta: string | null
    campaign_short_name: string | null
    success_criteria: Record<string, unknown> | null
    trigger_data: Record<string, unknown> | null
  }
  let sourceBrief: SourceBrief | null = null
  if (ad?.gcs_path) {
    const { data: asset } = await admin
      .from("creative_assets")
      .select("brief_id")
      .eq("gcs_path", ad.gcs_path)
      .limit(1)
      .maybeSingle()
    if (asset?.brief_id) {
      const { data } = await admin
        .from("creative_briefs")
        .select("id, format, copy_primary, copy_headline, copy_subtext, cta, campaign_short_name, success_criteria, trigger_data")
        .eq("id", asset.brief_id)
        .maybeSingle()
      sourceBrief = (data as SourceBrief | null) ?? null
    }
  }
  const sourceTd = sourceBrief?.trigger_data ?? null
  const sourceIsSvg = typeof sourceTd?.svg_template_id === "string"

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

  if (sourceBrief && sourceIsSvg && sourceTd) {
    const sourceNaming =
      sourceTd.naming && typeof sourceTd.naming === "object" ? (sourceTd.naming as Record<string, unknown>) : {}
    const sourceSc = sourceBrief.success_criteria ?? {}
    const formats = Array.isArray(sourceSc.formats) ? sourceSc.formats : ["4x5", "9x16"]
    Object.assign(briefRow.trigger_data, {
      template_id: sourceTd.template_id,
      category: sourceTd.category,
      generation_tool: sourceTd.generation_tool ?? "svg_template",
      svg_template_id: sourceTd.svg_template_id,
      svg_tokens: sourceTd.svg_tokens,
      svg_variations: sourceTd.svg_variations,
      photo_gcs_path: sourceTd.photo_gcs_path,
      angle: sourceTd.angle ?? ad?.angle,
      naming: {
        ...sourceNaming,
        test_id: nextTestId(
          (typeof sourceNaming.test_id === "string" && sourceNaming.test_id) || ad?.test_id || null,
        ),
      },
      source_brief_id: sourceBrief.id,
    })
    // Ready to preview in the pipeline (same flow as a brief made from a template).
    ;(briefRow as { status: string }).status = "briefed"
    briefRow.format = sourceBrief.format ?? formats.join(",")
    briefRow.copy_primary = sourceBrief.copy_primary ?? briefRow.copy_primary
    briefRow.copy_headline = sourceBrief.copy_headline ?? briefRow.copy_headline
    briefRow.copy_subtext = sourceBrief.copy_subtext
    briefRow.cta = sourceBrief.cta ?? briefRow.cta
    briefRow.campaign_short_name = sourceBrief.campaign_short_name ?? briefRow.campaign_short_name
    ;(briefRow as { success_criteria: Record<string, unknown> }).success_criteria = {
      ...briefRow.success_criteria,
      formats,
      concept_verify: false,
      ...(typeof sourceSc.preview_format === "string" ? { preview_format: sourceSc.preview_format } : {}),
    }
  }

  const { data: inserted, error: iErr } = await admin.from("creative_briefs").insert(briefRow).select("id").single()
  if (iErr) return { ok: false, error: iErr.message }
  return { ok: true, briefId: inserted.id as string }
}
