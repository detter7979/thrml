import type { Ad } from "@/types/paid-media"

import type { EvaluatorContext, PerformanceDailyRow, RuleResult } from "../types"
import { isoDateUtcDaysAgo } from "../types"

function adCpc7d(rows: PerformanceDailyRow[], adId: string): { cpc: number | null; clicks: number; conv: number } {
  const from = isoDateUtcDaysAgo(7)
  let spend = 0
  let clicks = 0
  let conv = 0
  for (const r of rows) {
    if (r.level !== "ad" || r.entity_id !== adId || r.date < from) continue
    spend += Number(r.spend_usd) || 0
    clicks += Number(r.clicks) || 0
    conv += Number(r.conversions) || 0
  }
  const cpc = clicks > 0 && spend > 0 ? spend / clicks : null
  return { cpc, clicks, conv }
}

function median(nums: number[]): number | null {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function rule03AdCpc3xMedian(ctx: EvaluatorContext): RuleResult[] {
  const raw = ctx.rules["auto_approve::pause_under_perf_threshold"]
  const parsed =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as { cpc_multiplier?: number; clicks_min?: number })
      : null
  const ratioThresh = parsed?.cpc_multiplier ?? 3
  const clicksMin = parsed?.clicks_min ?? 100

  const testAds = ctx.ads.filter((a) => a.status === "TEST")
  const bySet = new Map<string, Ad[]>()
  for (const a of testAds) {
    const arr = bySet.get(a.ad_set_id) ?? []
    arr.push(a)
    bySet.set(a.ad_set_id, arr)
  }

  const out: RuleResult[] = []

  for (const [setId, setAds] of bySet) {
    if (setAds.length < 2) continue
    const cpcs: { ad: Ad; cpc: number; clicks: number; conv: number }[] = []
    for (const ad of setAds) {
      const { cpc, clicks, conv } = adCpc7d(ctx.performanceDaily, ad.id)
      if (cpc !== null && clicks > 0) cpcs.push({ ad, cpc, clicks, conv })
    }
    if (cpcs.length < 2) continue
    const med = median(cpcs.map((x) => x.cpc))
    if (med === null || med <= 0) continue

    const withConv = cpcs.filter((x) => x.conv > 0)
    const onlyOneWithConv = withConv.length === 1

    for (const row of cpcs) {
      if (row.clicks < clicksMin) continue
      if (row.cpc <= med * ratioThresh) continue
      if (onlyOneWithConv && row.conv > 0) continue

      const others = cpcs.filter((x) => x.ad.id !== row.ad.id)
      const best = others.reduce((a, b) => (a.cpc < b.cpc ? a : b))
      const confidence = Math.min(0.95, 0.55 + (row.cpc / med - ratioThresh) * 0.1)

      out.push({
        kind: "PAUSE_AD",
        target: { campaignId: row.ad.campaign_id, adSetId: setId, adId: row.ad.id },
        payload: { rule: "03-ad-cpc-3x-median", ad_set_median_cpc: med, ad_cpc: row.cpc, ratio: row.cpc / med },
        evidence: {
          clicks_7d: row.clicks,
          median_cpc: med,
          conv_7d: row.conv,
        },
        rationale: `Ad ${row.ad.legacy_id ?? row.ad.id} (${row.ad.angle}) at $${row.cpc.toFixed(2)} CPC — ${(row.cpc / med).toFixed(2)}× ad set median. Sister ad ${best.ad.legacy_id ?? best.ad.id} (${best.ad.angle}) at $${best.cpc.toFixed(2)}.`,
        confidence,
      })
    }
  }

  return out
}
