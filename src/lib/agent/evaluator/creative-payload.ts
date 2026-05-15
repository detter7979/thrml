import type { Ad } from "@/types/paid-media"

import type { PerformanceMasterRow } from "./types"

export type CreativeStrategy =
  | "frequency_refresh"
  | "iterate_top_performer"
  | "paused_variation"
  | "refresh_declining"

export type CreativeVariantHint = {
  label: string
  angle?: string
  format?: string
  cta?: string
  hook_copy?: string
  /** Midjourney-style hint; creative-brief cron can rewrite */
  background_image_prompt_hint?: string
}

export function buildCreativePayload(params: {
  strategy: CreativeStrategy
  rule: string
  variations: 1 | 2 | 3
  variants: CreativeVariantHint[]
  messaging_direction: string
  visual_direction_hint?: string
  formats?: string[]
  extra?: Record<string, unknown>
}): Record<string, unknown> {
  return {
    creative_strategy: params.strategy,
    rule: params.rule,
    variations: params.variations,
    variants: params.variants,
    messaging_direction: params.messaging_direction,
    visual_direction_hint: params.visual_direction_hint,
    formats: params.formats ?? ["1x1"],
    ...params.extra,
  }
}

export function variantsForAd(
  ad: Ad,
  strategy: CreativeStrategy,
  count: 1 | 2 | 3
): CreativeVariantHint[] {
  const baseHook = ad.hook_copy?.trim() || `Lead with ${ad.angle.replace(/_/g, " ")}`
  const labels = ["A", "B", "C"] as const
  const out: CreativeVariantHint[] = []
  const angle = ad.angle
  const fmt = ad.format?.includes("9x16") ? "9x16" : "1x1"

  out.push({
    label: labels[0],
    angle,
    format: fmt,
    cta: ad.cta,
    hook_copy: `${baseHook} — control-led iteration`,
    background_image_prompt_hint: `Premium sauna/wellness scene aligned with ${angle}; vertical ${fmt}; no text in frame.`,
  })

  if (count >= 2) {
    out.push({
      label: labels[1],
      angle,
      format: fmt,
      cta: ad.cta,
      hook_copy: `${baseHook} — stronger social proof angle`,
      background_image_prompt_hint: `Include subtle social-trust cues (hosts, reviews as ambient context, no readable text).`,
    })
  }

  if (count >= 3) {
    const urgency =
      strategy === "frequency_refresh"
        ? "creative fatigue; emphasize novelty"
        : strategy === "refresh_declining"
          ? "reverse declining CTR with fresher hook"
          : strategy === "paused_variation"
            ? "reactivate paused winner with new angle"
            : "scale what already wins; tighten benefit"

    out.push({
      label: labels[2],
      angle,
      format: fmt,
      cta: ad.cta,
      hook_copy: `${baseHook} — ${urgency}`,
      background_image_prompt_hint: `Alternate composition/lighting from variant A; still on-brand.`,
    })
  }

  return out.slice(0, count)
}

/** Sum metrics for ad-level master rows between dates inclusive (YYYY-MM-DD). */
export function aggregateAdMaster(
  rows: PerformanceMasterRow[],
  adId: string,
  dateFrom: string,
  dateTo: string
): { spend: number; impressions: number; clicks: number; conversions: number } {
  let spend = 0
  let impressions = 0
  let clicks = 0
  let conversions = 0
  for (const r of rows) {
    if (r.level !== "ad" || r.ad_id !== adId) continue
    if (r.date < dateFrom || r.date > dateTo) continue
    spend += Number(r.spend_usd ?? 0)
    impressions += Number(r.impressions ?? 0)
    clicks += Number(r.clicks ?? 0)
    conversions += Number(r.conversions ?? 0)
  }
  return { spend, impressions, clicks, conversions }
}

export function ctrFromAgg(agg: { impressions: number; clicks: number }): number {
  return agg.impressions > 0 ? agg.clicks / agg.impressions : 0
}

export function cpaFromAgg(agg: { spend: number; conversions: number }): number | null {
  if (agg.conversions <= 0) return null
  return agg.spend / agg.conversions
}
