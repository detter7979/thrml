import { describe, expect, it } from "vitest"

import { mapRecKindToExecutionKind } from "../../meta-ads-agent/kind-mapper"
import { rule10AudienceTest } from "../rules/10-audience-test"
import type { EvaluatorContext, PerformanceDailyRow } from "../types"
import { isoDateUtcDaysAgo } from "../types"
import type { Recommendation } from "@/types/paid-media"

function perf(entity: string, daysAgo: number, spend: number, conversions: number, ev = "PUR"): PerformanceDailyRow {
  return {
    id: Math.random(),
    date: isoDateUtcDaysAgo(daysAgo),
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
    conv_event: ev,
    cost_per_conv: null,
    revenue_usd: null,
    ingested_at: new Date().toISOString(),
  }
}

const campaign = { id: "c1", legacy_id: "C001", name: "Guest", persona: "guest", platform: "META", status: "TEST", event: "PUR" }
const set = (id: string, audience: string) => ({
  id,
  legacy_id: id.toUpperCase(),
  campaign_id: "c1",
  name: id,
  status: "TEST",
  audience_src: audience,
  platform_adset_id: `meta_${id}`,
})

function ctx(overrides: Partial<EvaluatorContext> = {}): EvaluatorContext {
  return {
    campaigns: [campaign] as unknown as EvaluatorContext["campaigns"],
    adSets: [set("s1", "int-sauna"), set("s2", "broad")] as unknown as EvaluatorContext["adSets"],
    ads: [],
    performance: [],
    performanceDaily: [1, 2, 3, 4, 5].map((d) => perf("s1", d, 20, 3)), // 15 results at $6.67
    rules: { "guest.*::target_cost_pur_usd": 35 },
    recentRecs: [],
    campaignsWithRecentBudgetAction: new Set(),
    audiencePool: [
      { id: "x1", legacy_id: "AS020", campaign_id: "c9", audience_src: "int-sauna", placement: "REELS", persona: "guest" },
      { id: "x2", legacy_id: "AS021", campaign_id: "c9", audience_src: "lal1-purchase", placement: "FEED-STORIES", persona: "guest" },
      { id: "x3", legacy_id: "AS022", campaign_id: "c8", audience_src: "int-hosting", placement: "REELS", persona: "host" },
    ],
    ...overrides,
  }
}

describe("rule 10: audience test", () => {
  it("proposes a paused copy of the winner with an unused same-persona audience", () => {
    const out = rule10AudienceTest(ctx())
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe("CREATE_AD_SET")
    expect(out[0].target.adSetId).toBe("s1")
    expect(out[0].payload.targeting_from_ad_set_id).toBe("x2")
    expect(out[0].payload.audience_src).toBe("lal1-purchase")
  })

  it("needs enough results at or under target", () => {
    expect(rule10AudienceTest(ctx({ performanceDaily: [1, 2].map((d) => perf("s1", d, 20, 2)) }))).toHaveLength(0)
    expect(rule10AudienceTest(ctx({ performanceDaily: [1, 2, 3, 4, 5].map((d) => perf("s1", d, 200, 3)) }))).toHaveLength(0)
  })

  it("skips audiences proposed recently and full campaigns", () => {
    const recent = [{ kind: "CREATE_AD_SET", target_campaign_id: "c1", payload: { audience_src: "lal1-purchase" } }]
    expect(rule10AudienceTest(ctx({ recentRecs: recent as unknown as Recommendation[] }))).toHaveLength(0)
    const full = ["a", "b", "c", "d"].map((x) => set(x, `aud-${x}`))
    expect(rule10AudienceTest(ctx({ adSets: full as unknown as EvaluatorContext["adSets"] }))).toHaveLength(0)
  })
})

describe("build actions map to Meta executions", () => {
  const rec = (kind: string, payload: Record<string, unknown> = {}) =>
    ({ kind, payload, modified_payload: null, target_campaign_id: "c1", target_ad_set_id: null }) as unknown as Recommendation
  it("maps audience tests and phase advances, not watchlist items", () => {
    expect(mapRecKindToExecutionKind(rec("CREATE_AD_SET"))).toBe("duplicate_ad_set")
    expect(mapRecKindToExecutionKind(rec("ADVANCE_PHASE", { to_phase: "P2" }))).toBe("duplicate_ad_set")
    expect(mapRecKindToExecutionKind(rec("ADVANCE_PHASE", { warning: true }))).toBeNull()
    expect(mapRecKindToExecutionKind(rec("LAUNCH_TEST"))).toBeNull()
  })
})

describe("campaign kill suppresses child proposals", () => {
  it("drops ad set pauses and creative under a campaign being killed", async () => {
    const { suppressUnderStoppedCampaigns } = await import("../index")
    const p = (kind: string, campaignId: string, adSetId?: string) =>
      ({ kind, target: { campaignId, adSetId }, payload: {}, evidence: {}, rationale: "", confidence: 0.9 }) as never
    const out = suppressUnderStoppedCampaigns([
      p("KILL_CAMPAIGN", "c2"),
      p("PAUSE_AD_SET", "c2", "s4"),
      p("GENERATE_CREATIVE", "c2", "s5"),
      p("PAUSE_AD_SET", "c1", "s1"),
    ])
    expect(out.map((x) => `${x.kind}:${x.target.campaignId}`)).toEqual([
      "KILL_CAMPAIGN:c2",
      "PAUSE_AD_SET:c1",
    ])
  })
})
