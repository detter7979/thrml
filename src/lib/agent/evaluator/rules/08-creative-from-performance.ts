import {
  aggregateAdMaster,
  buildCreativePayload,
  cpaFromAgg,
  ctrFromAgg,
  variantsForAd,
} from "../creative-payload"
import type { EvaluatorContext, RuleResult } from "../types"
import { isoDateUtcDaysAgo, ruleNumber } from "../types"

function dateRangeLast(daysBack: number, span: number): { from: string; to: string } {
  const to = isoDateUtcDaysAgo(daysBack)
  const from = isoDateUtcDaysAgo(daysBack + span - 1)
  return { from, to }
}

/** Best CPA ad in each active ad set (scale winning messaging). */
export function rule08TopPerformerCreatives(ctx: EvaluatorContext): RuleResult[] {
  const minSpend = ruleNumber(ctx.rules, "creative", "top_performer_min_spend_7d_usd", 20)
  const minConv = Math.max(1, Math.round(ruleNumber(ctx.rules, "creative", "top_performer_min_conversions_7d", 1)))
  const variations = ((): 1 | 2 | 3 => {
    const n = Math.round(ruleNumber(ctx.rules, "creative", "default_variations", 3))
    return n >= 3 ? 3 : n === 2 ? 2 : 1
  })()

  const { from: dFrom, to: dTo } = dateRangeLast(0, 7)
  const out: RuleResult[] = []
  const campById = new Map(ctx.campaigns.map((c) => [c.id, c]))

  const activeSets = new Set(
    ctx.adSets.filter((s) => s.status === "TEST" || s.status === "SCALE").map((s) => s.id)
  )
  const adsBySet = new Map<string, typeof ctx.ads>()
  for (const a of ctx.ads) {
    if (a.status !== "TEST" && a.status !== "SCALE") continue
    if (!activeSets.has(a.ad_set_id)) continue
    const list = adsBySet.get(a.ad_set_id) ?? []
    list.push(a)
    adsBySet.set(a.ad_set_id, list)
  }

  for (const [setId, ads] of adsBySet) {
    type Cand = { ad: (typeof ads)[0]; cpa: number; spend: number; conv: number }
    const candidates: Cand[] = []
    for (const ad of ads) {
      const agg = aggregateAdMaster(ctx.performance, ad.id, dFrom, dTo)
      if (agg.spend < minSpend || agg.conversions < minConv) continue
      const cpa = cpaFromAgg(agg)
      if (cpa == null) continue
      candidates.push({ ad, cpa, spend: agg.spend, conv: agg.conversions })
    }
    if (!candidates.length) continue
    candidates.sort((a, b) => a.cpa - b.cpa || b.spend - a.spend)
    const best = candidates[0]
    const ad = best.ad
    const set = ctx.adSets.find((s) => s.id === setId)
    const camp = campById.get(ad.campaign_id)
    const funnel = camp?.funnel ?? "PROSP"
    const lift = candidates.length > 1 ? best.cpa / Math.max(candidates[1].cpa, 1e-6) : 1
    const confidence = Math.min(0.92, Math.max(0.56, 0.56 + (1 - Math.min(lift, 1)) * 0.35))

    const vars = variantsForAd(ad, "iterate_top_performer", variations)
    out.push({
      kind: "GENERATE_CREATIVE",
      target: { campaignId: ad.campaign_id, adSetId: setId, adId: ad.id },
      payload: buildCreativePayload({
        strategy: "iterate_top_performer",
        rule: "08-top-performer",
        variations,
        variants: vars,
        messaging_direction: `Scale angles that already convert in ${funnel}: iterate on the strongest CPA in this ad set.`,
        extra: {
          cpa_7d: best.cpa,
          spend_7d: best.spend,
          conversions_7d: best.conv,
        },
      }),
      evidence: {
        window: { from: dFrom, to: dTo },
        ad_legacy_id: ad.legacy_id,
        ad_set_legacy_id: set?.legacy_id,
      },
      rationale: `Top performer in ad set ${set?.legacy_id ?? set?.name ?? setId}: ad ${ad.legacy_id ?? ad.name} has best CPA (~$${best.cpa.toFixed(2)}) over 7d with ${best.conv} conv / $${best.spend.toFixed(0)} spend — generate ${variations} messaging iteration(s).`,
      confidence,
    })
  }

  return out
}

/** Paused ads that had meaningful delivery — try new angles before reactivation. */
export function rule09PausedCreativeVariations(ctx: EvaluatorContext): RuleResult[] {
  const minImpressions = ruleNumber(ctx.rules, "creative", "paused_refresh_min_impressions_30d", 5000)
  const variations = ((): 1 | 2 | 3 => {
    const n = Math.round(ruleNumber(ctx.rules, "creative", "paused_variations", 2))
    return n >= 3 ? 3 : n === 2 ? 2 : 1
  })()

  const { from: dFrom, to: dTo } = dateRangeLast(0, 30)
  const out: RuleResult[] = []

  for (const ad of ctx.ads) {
    if (ad.status !== "PAUSED") continue
    const agg = aggregateAdMaster(ctx.performance, ad.id, dFrom, dTo)
    if (agg.impressions < minImpressions) continue

    const set = ctx.adSets.find((s) => s.id === ad.ad_set_id)
    if (!set || (set.status !== "TEST" && set.status !== "SCALE" && set.status !== "PAUSED")) continue

    const ctr = ctrFromAgg(agg)
    const confidence = Math.min(0.88, Math.max(0.55, 0.55 + Math.min(ctr * 50, 0.25)))

    const vars = variantsForAd(ad, "paused_variation", variations)
    out.push({
      kind: "GENERATE_CREATIVE",
      target: { campaignId: ad.campaign_id, adSetId: ad.ad_set_id, adId: ad.id },
      payload: buildCreativePayload({
        strategy: "paused_variation",
        rule: "09-paused-variation",
        variations,
        variants: vars,
        messaging_direction: `This creative already proved reach; draft fresh hooks before re-testing live.`,
        extra: {
          impressions_30d: agg.impressions,
          ctr_30d: ctr,
        },
      }),
      evidence: { window: { from: dFrom, to: dTo }, impressions: agg.impressions },
      rationale: `Paused ad ${ad.legacy_id ?? ad.name} had ${agg.impressions.toLocaleString()} impressions in 30d — propose ${variations} new variation(s) tailored for a careful re-launch.`,
      confidence,
    })
  }

  return out
}

/** Active ads with measurable CTR drop week-over-week. */
export function rule10DecliningCtrRefresh(ctx: EvaluatorContext): RuleResult[] {
  const minSpend7 = ruleNumber(ctx.rules, "creative", "decline_min_spend_recent_usd", 15)
  const ctrRatioMax = ruleNumber(ctx.rules, "creative", "decline_ctr_ratio_max", 0.72)
  const minImpressions7 = ruleNumber(ctx.rules, "creative", "decline_min_impressions_7d", 4000)
  const variations = ((): 1 | 2 | 3 => {
    const n = Math.round(ruleNumber(ctx.rules, "creative", "default_variations", 3))
    return n >= 3 ? 3 : n === 2 ? 2 : 1
  })()

  const recent = dateRangeLast(0, 7)
  const prev = dateRangeLast(7, 7)
  const out: RuleResult[] = []

  for (const ad of ctx.ads) {
    if (ad.status !== "TEST" && ad.status !== "SCALE") continue

    const aR = aggregateAdMaster(ctx.performance, ad.id, recent.from, recent.to)
    const aP = aggregateAdMaster(ctx.performance, ad.id, prev.from, prev.to)
    if (aR.spend < minSpend7 || aR.impressions < minImpressions7) continue
    if (aP.impressions < 500) continue

    const ctrR = ctrFromAgg(aR)
    const ctrP = ctrFromAgg(aP)
    if (ctrP <= 0 || ctrR / ctrP > ctrRatioMax) continue

    const set = ctx.adSets.find((s) => s.id === ad.ad_set_id)
    const drop = 1 - ctrR / ctrP
    const confidence = Math.min(0.9, Math.max(0.56, 0.56 + drop * 0.8))

    const vars = variantsForAd(ad, "refresh_declining", variations)
    out.push({
      kind: "GENERATE_CREATIVE",
      target: { campaignId: ad.campaign_id, adSetId: ad.ad_set_id, adId: ad.id },
      payload: buildCreativePayload({
        strategy: "refresh_declining",
        rule: "10-ctr-decline",
        variations,
        variants: vars,
        messaging_direction: `CTR fell ~${(drop * 100).toFixed(0)}% vs prior week — refresh creative to recover attention.`,
        extra: {
          ctr_7d: ctrR,
          ctr_prior_7d: ctrP,
          impressions_7d: aR.impressions,
        },
      }),
      evidence: {
        recent,
        prev,
        ctr_7d: ctrR,
        ctr_prior_7d: ctrP,
      },
      rationale: `Ad ${ad.legacy_id ?? ad.name}: CTR declined from ${(ctrP * 100).toFixed(2)}% to ${(ctrR * 100).toFixed(2)}% week-over-week with spend $${aR.spend.toFixed(0)} — recommend ${variations} refreshed variant(s).`,
      confidence,
    })
  }

  return out
}

export function rule08Through10CreativePerformance(ctx: EvaluatorContext): RuleResult[] {
  return [
    ...rule08TopPerformerCreatives(ctx),
    ...rule09PausedCreativeVariations(ctx),
    ...rule10DecliningCtrRefresh(ctx),
  ]
}
