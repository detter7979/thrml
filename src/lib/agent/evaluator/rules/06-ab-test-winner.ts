import type { Ad } from "@/types/paid-media"

import type { EvaluatorContext, PerformanceDailyRow, RuleResult } from "../types"
import { isoDateUtcDaysAgo } from "../types"

function adMetrics7d(rows: PerformanceDailyRow[], adId: string): { clicks: number; conv: number } {
  const from = isoDateUtcDaysAgo(7)
  let clicks = 0
  let conv = 0
  for (const r of rows) {
    if (r.level !== "ad" || r.entity_id !== adId || r.date < from) continue
    clicks += Number(r.clicks) || 0
    conv += Number(r.conversions) || 0
  }
  return { clicks, conv }
}

function gammaSumExp(shape: number): number {
  let s = 0
  for (let i = 0; i < shape; i++) s -= Math.log(Math.random() + 1e-12)
  return s
}

function sampleBetaBinomial(conv: number, clicks: number, samples: number): number[] {
  const a = 1 + conv
  const b = 1 + Math.max(0, clicks - conv)
  const ai = Math.max(1, Math.round(a))
  const bi = Math.max(1, Math.round(b))
  const out: number[] = []
  for (let i = 0; i < samples; i++) {
    const x = gammaSumExp(ai)
    const y = gammaSumExp(bi)
    out.push(x / (x + y))
  }
  return out
}

function pWinnerBetter(convW: number, clkW: number, convL: number, clkL: number): number {
  const s = 2500
  const pw = sampleBetaBinomial(convW, clkW, s)
  const pl = sampleBetaBinomial(convL, clkL, s)
  let wins = 0
  for (let i = 0; i < s; i++) {
    if (pw[i] > pl[i]) wins++
  }
  return wins / s
}

export function rule06AbTestWinner(ctx: EvaluatorContext): RuleResult[] {
  const minClicks = 200
  const thresh = 0.95
  const out: RuleResult[] = []

  const testAds = ctx.ads.filter((a) => a.status === "TEST")
  const bySetTest = new Map<string, Map<string, Ad[]>>()
  for (const a of testAds) {
    if (!bySetTest.has(a.ad_set_id)) bySetTest.set(a.ad_set_id, new Map())
    const m = bySetTest.get(a.ad_set_id)!
    if (!m.has(a.test_id)) m.set(a.test_id, [])
    m.get(a.test_id)!.push(a)
  }

  for (const [, byTest] of bySetTest) {
    for (const [, group] of byTest) {
      if (group.length < 2) continue
      const stats = group.map((ad) => {
        const m = adMetrics7d(ctx.performanceDaily, ad.id)
        return { ad, ...m, rate: m.clicks > 0 ? m.conv / m.clicks : 0 }
      })
      const sorted = [...stats].sort((a, b) => b.rate - a.rate)
      const winner = sorted[0]
      const loser = sorted[1]
      if (winner.clicks < minClicks || loser.clicks < minClicks) continue
      const p = pWinnerBetter(winner.conv, winner.clicks, loser.conv, loser.clicks)
      if (p <= thresh) continue

      const nextTestId = `${loser.ad.test_id}-T1`

      out.push({
        kind: "PAUSE_AD",
        target: { campaignId: loser.ad.campaign_id, adSetId: loser.ad.ad_set_id, adId: loser.ad.id },
        payload: {
          rule: "06-ab-test-winner",
          role: "pause_loser",
          winner_ad_id: winner.ad.id,
          posterior: p,
        },
        evidence: { winner_clicks: winner.clicks, loser_clicks: loser.clicks, p_winner_better: p },
        rationale: `AB ${loser.ad.test_id}: pause loser ${loser.ad.legacy_id ?? loser.ad.id}; winner ${winner.ad.legacy_id ?? winner.ad.id} (posterior ${(p * 100).toFixed(1)}%).`,
        confidence: p,
      })

      out.push({
        kind: "LAUNCH_TEST",
        target: { campaignId: winner.ad.campaign_id, adSetId: winner.ad.ad_set_id },
        payload: {
          rule: "06-ab-test-winner",
          role: "launch_next_test",
          carry_forward_winner_ad_id: winner.ad.id,
          suggested_next_test_id: nextTestId,
        },
        evidence: { posterior: p },
        rationale: `Launch next test ${nextTestId} carrying forward winner creative from ${winner.ad.legacy_id ?? winner.ad.id}.`,
        confidence: p,
      })
    }
  }

  return out
}
