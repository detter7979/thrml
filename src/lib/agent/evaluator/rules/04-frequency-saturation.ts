import {
  aggregateAdMaster,
  buildCreativePayload,
  variantsForAd,
} from "../creative-payload"
import type { EvaluatorContext, PerformanceDailyRow, RuleResult } from "../types"
import { isoDateUtcDaysAgo, ruleNumber } from "../types"

function avgFrequency7d(rows: PerformanceDailyRow[], adSetId: string): { avg: number | null; days: number } {
  const from = isoDateUtcDaysAgo(7)
  const freqs: number[] = []
  for (const r of rows) {
    if (r.level !== "ad_set" || r.entity_id !== adSetId || r.date < from) continue
    const f = Number(r.frequency)
    if (Number.isFinite(f) && f > 0) freqs.push(f)
  }
  if (!freqs.length) return { avg: null, days: 0 }
  return { avg: freqs.reduce((a, b) => a + b, 0) / freqs.length, days: freqs.length }
}

export function rule04FrequencySaturation(ctx: EvaluatorContext): RuleResult[] {
  const capRt = ruleNumber(ctx.rules, "saturation", "frequency_cap_rt", NaN) || ruleNumber(ctx.rules, "global", "frequency_saturation_cap", 3)
  const capProsp = ruleNumber(ctx.rules, "saturation", "frequency_cap_prosp", 2)
  const out: RuleResult[] = []

  const sets = ctx.adSets.filter((s) => s.status === "TEST" || s.status === "SCALE")
  const campById = new Map(ctx.campaigns.map((c) => [c.id, c]))

  for (const s of sets) {
    const { avg, days } = avgFrequency7d(ctx.performanceDaily, s.id)
    if (avg === null || days < 7) continue
    const camp = campById.get(s.campaign_id)
    const funnel = camp?.funnel ?? "PROSP"
    const cap = funnel === "RT" || funnel === "CRM" ? capRt : capProsp
    if (avg <= cap) continue

    const over = avg - cap
    const confidence = Math.min(0.95, Math.max(0.55, 0.55 + (over / Math.max(cap, 0.1)) * 0.2))

    const dFrom = isoDateUtcDaysAgo(6)
    const dTo = isoDateUtcDaysAgo(0)
    const adsInSet = ctx.ads.filter((a) => a.ad_set_id === s.id && (a.status === "TEST" || a.status === "SCALE"))
    let pick = adsInSet[0]
    let bestSpend = -1
    for (const a of adsInSet) {
      const agg = aggregateAdMaster(ctx.performance, a.id, dFrom, dTo)
      if (agg.spend > bestSpend) {
        bestSpend = agg.spend
        pick = a
      }
    }
    const variations = ((): 1 | 2 | 3 => {
      const n = Math.round(ruleNumber(ctx.rules, "creative", "frequency_saturation_variations", 3))
      return n >= 3 ? 3 : n === 2 ? 2 : 1
    })()

    const vars = pick ? variantsForAd(pick, "frequency_refresh", variations) : []

    out.push({
      kind: "GENERATE_CREATIVE",
      target: { campaignId: s.campaign_id, adSetId: s.id, adId: pick?.id },
      payload: buildCreativePayload({
        strategy: "frequency_refresh",
        rule: "04-frequency-saturation",
        variations,
        variants: vars,
        messaging_direction: `Audience fatigue (${avg.toFixed(2)} avg frequency / 7d). Introduce net-new creative angles for this ad set.`,
        extra: {
          avg_frequency_7d: avg,
          cap,
          funnel,
        },
      }),
      evidence: { days_sampled: days, frequency: avg },
      rationale: `Ad set ${s.legacy_id ?? s.name}: 7d avg frequency ${avg.toFixed(2)} exceeds cap ${cap} (${funnel}).`,
      confidence,
    })
  }

  return out
}
