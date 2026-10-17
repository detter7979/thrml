import { describe, expect, it } from "vitest"

import { autoApprovalDecision, dataIsFresh, isAutoApproveMode } from "../auto-approve"
import { rule09AdSetWastedSpend } from "../rules/09-ad-set-wasted-spend"
import type { EvaluatorContext, PerformanceDailyRow, RuleResult } from "../types"
import { isoDateUtcDaysAgo } from "../types"

function day(n: number) {
  return isoDateUtcDaysAgo(n)
}

function perf(entity: string, daysAgo: number, spend: number, conversions: number): PerformanceDailyRow {
  return {
    id: Math.random(),
    date: day(daysAgo),
    level: "ad_set",
    entity_id: entity,
    platform_entity_id: null,
    impressions: 1000,
    reach: 800,
    clicks: 20,
    link_clicks: 15,
    spend_usd: spend,
    cpm: null,
    cpc: null,
    ctr: null,
    frequency: 1.2,
    conversions,
    conv_event: "PUR",
    cost_per_conv: null,
    revenue_usd: null,
    ingested_at: new Date().toISOString(),
  }
}

function ctx(overrides: Partial<EvaluatorContext> = {}): EvaluatorContext {
  const campaign = { id: "c1", legacy_id: "C001", name: "Guest test", persona: "guest", status: "TEST", daily_budget_usd: 50 }
  const set = (id: string) => ({ id, legacy_id: id.toUpperCase(), campaign_id: "c1", name: id, status: "TEST" })
  return {
    campaigns: [campaign] as unknown as EvaluatorContext["campaigns"],
    adSets: [set("s1"), set("s2")] as unknown as EvaluatorContext["adSets"],
    ads: [],
    performance: [],
    performanceDaily: [],
    rules: { "guest.*::target_cac_purchase_usd": 35 },
    recentRecs: [],
    campaignsWithRecentBudgetAction: new Set(),
    ...overrides,
  }
}

describe("rule 09: ad set wasted spend", () => {
  it("pauses an ad set with no conversions after 2x target spend", () => {
    const rows = [1, 2, 3, 4].map((d) => perf("s1", d, 20, 0)) // $80 > 2 × $35
    const out = rule09AdSetWastedSpend(ctx({ performanceDaily: rows }))
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe("PAUSE_AD_SET")
    expect(out[0].target.adSetId).toBe("s1")
    expect(out[0].payload.reason).toBe("no_conversions")
  })

  it("leaves it alone below the spend threshold or with too few days", () => {
    expect(rule09AdSetWastedSpend(ctx({ performanceDaily: [1, 2, 3].map((d) => perf("s1", d, 20, 0)) }))).toHaveLength(0) // $60 < $70
    expect(rule09AdSetWastedSpend(ctx({ performanceDaily: [1, 2].map((d) => perf("s1", d, 50, 0)) }))).toHaveLength(0) // 2 days
  })

  it("pauses when CPA is 3x target, keeps a profitable ad set", () => {
    const bad = [1, 2, 3, 4, 5].map((d) => perf("s1", d, 30, d === 1 ? 1 : 0)) // $150 / 1 conv
    const good = [1, 2, 3, 4, 5].map((d) => perf("s2", d, 30, 1)) // $30 CPA
    const out = rule09AdSetWastedSpend(ctx({ performanceDaily: [...bad, ...good] }))
    expect(out.map((r) => r.target.adSetId)).toEqual(["s1"])
    expect(out[0].payload.reason).toBe("cpa_over_target")
  })

  it("never pauses the last live ad set in a campaign", () => {
    const only = ctx({
      adSets: [{ id: "s1", legacy_id: "S1", campaign_id: "c1", name: "s1", status: "TEST" }] as unknown as EvaluatorContext["adSets"],
      performanceDaily: [1, 2, 3, 4].map((d) => perf("s1", d, 40, 0)),
    })
    expect(rule09AdSetWastedSpend(only)).toHaveLength(0)
  })
})

describe("auto-approval", () => {
  const fresh = [perf("s1", 1, 10, 0)]
  const pauseSet: RuleResult = {
    kind: "PAUSE_AD_SET",
    target: { adSetId: "s1" },
    payload: { rule: "09-ad-set-wasted-spend" },
    evidence: {},
    rationale: "",
    confidence: 0.85,
  }

  it("is off unless approval_mode is AUTO_APPROVE_LOW_STAKES", () => {
    expect(isAutoApproveMode(ctx())).toBe(false)
    expect(isAutoApproveMode(ctx({ rules: { "global::approval_mode": "AUTO_APPROVE_LOW_STAKES" } }))).toBe(true)
  })

  it("approves a confident ad-set pause on fresh data", () => {
    expect(autoApprovalDecision(ctx({ performanceDaily: fresh }), pauseSet).eligible).toBe(true)
  })

  it("refuses everything when data is stale", () => {
    const stale = [perf("s1", 5, 10, 0)]
    expect(dataIsFresh(ctx({ performanceDaily: stale }))).toBe(false)
    expect(autoApprovalDecision(ctx({ performanceDaily: stale }), pauseSet).eligible).toBe(false)
  })

  it("never auto-approves kills, even if config forgets them", () => {
    const kill = { ...pauseSet, kind: "KILL_CAMPAIGN" as const }
    const c = ctx({ performanceDaily: fresh, rules: { "auto_approve::requires_human_kinds": [] } })
    expect(autoApprovalDecision(c, kill).eligible).toBe(false)
  })

  it("approves small budget changes within the % cap only", () => {
    const budget = (current: number, next: number): RuleResult => ({
      kind: "ADJUST_BUDGET",
      target: { campaignId: "c1" },
      payload: { current_daily_budget_usd: current, new_daily_budget_usd: next },
      evidence: {},
      rationale: "",
      confidence: 0.8,
    })
    const c = ctx({ performanceDaily: fresh })
    expect(autoApprovalDecision(c, budget(50, 62)).eligible).toBe(true) // +$12, +24%
    expect(autoApprovalDecision(c, budget(50, 75)).eligible).toBe(false) // +$25 > $20
    expect(autoApprovalDecision(c, budget(20, 28)).eligible).toBe(false) // +40% > 30%
  })

  it("requires the click minimum for CPC-outlier ad pauses", () => {
    const pauseAd = (clicks: number): RuleResult => ({
      kind: "PAUSE_AD",
      target: { adId: "a1" },
      payload: { rule: "03-ad-cpc-3x-median" },
      evidence: { clicks_7d: clicks },
      rationale: "",
      confidence: 0.7,
    })
    const c = ctx({ performanceDaily: fresh })
    expect(autoApprovalDecision(c, pauseAd(150)).eligible).toBe(true)
    expect(autoApprovalDecision(c, pauseAd(40)).eligible).toBe(false)
  })
})

describe("event-aware cost per result", () => {
  // Ingest puts the day's spend on the first event row only; results must count the campaign's own event.
  function row(entity: string, daysAgo: number, spend: number, conversions: number, ev: string): PerformanceDailyRow {
    return { ...perf(entity, daysAgo, spend, conversions), conv_event: ev as PerformanceDailyRow["conv_event"] }
  }
  const hostCtx = (performanceDaily: PerformanceDailyRow[]) =>
    ctx({
      campaigns: [
        { id: "c1", legacy_id: "C001", name: "Host BH", persona: "host", event: "BH", status: "TEST", daily_budget_usd: 20 },
      ] as unknown as EvaluatorContext["campaigns"],
      rules: { "host.*::target_cac_signup_usd": 5 },
      performanceDaily,
    })

  it("keeps an ad set whose BH results arrive on a zero-spend row", () => {
    const rows = [1, 2, 3, 4].flatMap((d) => [row("s1", d, 20, 3, "VC"), row("s1", d, 0, 6, "BH")]) // $80 / 24 BH = $3.33
    expect(rule09AdSetWastedSpend(hostCtx(rows))).toHaveLength(0)
  })

  it("pauses when spend has no BH results even if other events fired", () => {
    const rows = [1, 2, 3, 4].map((d) => row("s1", d, 20, 30, "VC")) // $80, 0 BH
    const out = rule09AdSetWastedSpend(hostCtx(rows))
    expect(out.map((r) => r.target.adSetId)).toEqual(["s1"])
  })
})
