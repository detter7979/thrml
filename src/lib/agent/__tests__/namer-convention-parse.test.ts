import { describe, it, expect } from "vitest"

import {
  normalizeAdFormatToken,
  parseAdSetConventionName,
  parseCampaignConventionName,
} from "../namer-convention-parse"

describe("parseCampaignConventionName", () => {
  it("parses campaign with optional C### prefix", () => {
    const parsed = parseCampaignConventionName(
      "C001_META_host_sauna_US_P1_PROSP_BH_2025W22_v1",
    )
    expect(parsed).toMatchObject({
      legacy_id: "C001",
      platform: "META",
      persona: "host",
      service: "sauna",
      geo: "US",
      phase: "P1",
      funnel: "PROSP",
      event: "BH",
      launch_week: "2025W22",
      version: "v1",
    })
  })

  it("parses campaign without legacy prefix", () => {
    const parsed = parseCampaignConventionName("META_guest_all_CA_P2_RT_NL_2026W01")
    expect(parsed?.legacy_id).toBeNull()
    expect(parsed?.platform).toBe("META")
    expect(parsed?.funnel).toBe("RT")
  })

  it("returns null for invalid campaign names", () => {
    expect(parseCampaignConventionName("")).toBeNull()
    expect(parseCampaignConventionName("META_host")).toBeNull()
  })
})

describe("parseAdSetConventionName", () => {
  it("parses ad set with AS### prefix and placement suffix", () => {
    const parsed = parseAdSetConventionName("AS001_broad-interest_FEED-STORIES")
    expect(parsed).toEqual({
      legacy_id: "AS001",
      name: "AS001_broad-interest_FEED-STORIES",
      audience_src: "broad-interest",
      placement: "FEED-STORIES",
    })
  })

  it("returns null when audience or placement missing", () => {
    expect(parseAdSetConventionName("AS001")).toBeNull()
    expect(parseAdSetConventionName("broad-interest")).toBeNull()
  })
})

describe("normalizeAdFormatToken", () => {
  it("maps static and video formats", () => {
    expect(normalizeAdFormatToken("Static_9x16")).toBe("Static_9x16")
    expect(normalizeAdFormatToken("static_1x1")).toBe("Static_1x1")
    expect(normalizeAdFormatToken("Video_15s")).toBe("Video_15s")
    expect(normalizeAdFormatToken("Video_5s")).toBe("Video_5s")
  })

  it("falls back to Static_1x1 for unknown tokens", () => {
    expect(normalizeAdFormatToken("unknown")).toBe("Static_1x1")
  })
})

describe("campaign names without a launch week", () => {
  it("parses the new form and keeps reading the old one", async () => {
    const { parseCampaignConventionName } = await import("@/lib/agent/namer-convention-parse")
    const now = parseCampaignConventionName("C001_META_host_sauna_SEA_P1_PROSP_BH")
    expect(now?.legacy_id).toBe("C001")
    expect(now?.event).toBe("BH")
    expect(now?.launch_week).toBe("")
    expect(parseCampaignConventionName("C007_META_host_sauna_SEA_P3_LAL_ACT_v2")?.version).toBe("v2")
    expect(parseCampaignConventionName("C001_META_host_sauna_SEA_P1_PROSP_BH_2026W46")?.launch_week).toBe("2026W46")
    expect(parseCampaignConventionName("C007_META_host_sauna_SEA_P3_LAL_ACT_2027W04_v2")?.version).toBe("v2")
  })

  it("builds the sheet formula without the LAUNCH column", async () => {
    const { buildCampaignAutoNameFormula } = await import("@/lib/agent/namer-sheet-formulas")
    const headers = ["Camp ID", "PLATFORM", "PERSONA", "SERVICE", "GEO", "PHASE", "FUNNEL", "EVENT", "LAUNCH", "VER"]
    const f = buildCampaignAutoNameFormula(headers, 4)!
    expect(f).not.toContain("$I4")
    expect(f).toContain("UPPER($H4)")
    expect(f).toContain('IF($J4="","","_"&LOWER($J4))')
  })
})
