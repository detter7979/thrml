import { describe, expect, it } from "vitest"

import { adMetricsWindow, rule06AbTestWinner } from "../rules/06-ab-test-winner"
import type { EvaluatorContext, PerformanceDailyRow } from "../types"
import { isoDateUtcDaysAgo } from "../types"

function row(adId: string, clicks: number | null, conversions: number, convEvent: string): PerformanceDailyRow {
  return {
    id: Math.random(),
    date: isoDateUtcDaysAgo(9),
    level: "ad",
    entity_id: adId,
    platform_entity_id: null,
    impressions: 5000,
    reach: 4000,
    clicks,
    link_clicks: clicks,
    spend_usd: 50,
    cpm: null,
    cpc: null,
    ctr: null,
    frequency: 1.1,
    conversions,
    conv_event: convEvent,
    cost_per_conv: null,
    revenue_usd: null,
    ingested_at: new Date().toISOString(),
  } as PerformanceDailyRow
}

function ad(id: string, angle: string) {
  return {
    id,
    legacy_id: id.toUpperCase(),
    ad_set_id: "s1",
    campaign_id: "c1",
    test_id: "T01",
    variant: "A",
    angle,
    status: "TEST",
    conv_event: "BH",
  }
}

function ctx(daily: PerformanceDailyRow[]): EvaluatorContext {
  return {
    campaigns: [{ id: "c1", legacy_id: "C001", status: "TEST" }],
    adSets: [{ id: "s1", legacy_id: "AS001", campaign_id: "c1", status: "TEST", conv_event: "BH" }],
    ads: [ad("a1", "ease"), ad("a2", "idle_space"), ad("a3", "urgency"), ad("a4", "income")],
    performance: [],
    performanceDaily: daily,
    rules: {},
    recentRecs: [],
    campaignsWithRecentBudgetAction: new Set<string>(),
  } as unknown as EvaluatorContext
}

describe("rule 06 with more than two ads in a test", () => {
  it("counts only the ad's own optimization event", () => {
    const daily = [row("a1", 300, 30, "BH"), row("a1", null, 12, "HO")]
    expect(adMetricsWindow(daily, "a1", "BH", 14)).toEqual({ clicks: 300, conv: 30 })
  })

  it("pauses every clear loser against the leader and proposes one next test", () => {
    const daily = [
      row("a1", 400, 120, "BH"),
      row("a2", 400, 20, "BH"),
      row("a3", 400, 16, "BH"),
      row("a4", 400, 110, "BH"),
    ]
    const out = rule06AbTestWinner(ctx(daily))
    const paused = out.filter((r) => r.kind === "PAUSE_AD").map((r) => r.target.adId).sort()
    expect(paused).toEqual(["a2", "a3"])
    const next = out.filter((r) => r.kind === "LAUNCH_TEST")
    expect(next).toHaveLength(1)
    expect((next[0].payload as { suggested_next_test_id: string }).suggested_next_test_id).toBe("T02")
  })

  it("stays quiet until ads reach the click threshold", () => {
    const daily = [row("a1", 60, 20, "BH"), row("a2", 60, 1, "BH"), row("a3", 60, 1, "BH"), row("a4", 60, 2, "BH")]
    expect(rule06AbTestWinner(ctx(daily))).toEqual([])
  })
})

describe("rules that were stored but not enforced", () => {
  it("rule 06 makes no call before the test window ends", () => {
    const daily = [row("a1", 400, 120, "BH"), row("a2", 400, 20, "BH"), row("a3", 400, 16, "BH"), row("a4", 400, 110, "BH")]
      .map((r) => ({ ...r, date: isoDateUtcDaysAgo(3) }))
    expect(rule06AbTestWinner(ctx(daily))).toEqual([])
  })

  it("warm-up drops proposals for an ad set that started delivering inside the window", async () => {
    const { suppressDuringWarmUp } = await import("../index")
    const c = ctx([{ ...row("a1", 10, 0, "BH"), level: "ad_set", entity_id: "s1", date: isoDateUtcDaysAgo(2) } as PerformanceDailyRow])
    const pause = { kind: "PAUSE_AD", target: { campaignId: "c1", adId: "a2" }, payload: { rule: "03" }, evidence: {}, rationale: "", confidence: 0.9 } as const
    const stale = { ...pause, payload: { rule: "07-stale-data" } }
    expect(suppressDuringWarmUp(c, [pause, stale])).toEqual([stale])
    const old = ctx([{ ...row("a1", 10, 0, "BH"), level: "ad_set", entity_id: "s1", date: isoDateUtcDaysAgo(9) } as PerformanceDailyRow])
    expect(suppressDuringWarmUp(old, [pause])).toEqual([pause])
  })
})
