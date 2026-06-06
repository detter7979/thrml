import { describe, expect, it } from "vitest"

import {
  buildAdBuilderAutoNameFormula,
  buildAdSetAutoNameFormula,
  buildCampaignAutoNameFormula,
} from "../namer-sheet-formulas"

const AD_BUILDER_HEADERS = [
  "Ad ID",
  "AdSet ID",
  "Campaign ID",
  "ANGLE",
  "FORMAT",
  "Size",
  "Video Length",
  "CTA",
  "TEST",
  "VAR",
  "Ad Name (auto)",
  "GCS Path",
  "Platform Campaign ID",
  "Platform Ad Set ID",
  "Platform Ad ID",
]

const CAMPAIGN_HEADERS = [
  "Camp ID",
  "PLATFORM",
  "PERSONA",
  "SERVICE",
  "GEO",
  "PHASE",
  "FUNNEL",
  "EVENT",
  "LAUNCH",
  "VER",
  "Budget/day",
  "Budget Mode",
  "Campaign Name (auto)",
  "Platform Camp ID",
  "STATUS",
  "NOTES",
]

const AD_SET_HEADERS = [
  "AdSet ID",
  "Camp ID",
  "Campaign Name (ref)",
  "AUDIENCE_SRC",
  "PLACEMENT",
  "Ad Set Name (auto)",
  "Conv. Event",
  "Budget %",
  "Platform AdSet ID",
  "Status",
  "Notes",
]

describe("buildAdBuilderAutoNameFormula", () => {
  it("matches live Ad Builder layout", () => {
    const formula = buildAdBuilderAutoNameFormula(AD_BUILDER_HEADERS, 4)
    expect(formula).toMatch(/^=IF\(OR\(\$I4=""/)
    expect(formula).toContain("$A4")
    expect(formula).toContain("$I4")
    expect(formula).toContain("$J4")
    expect(formula).toContain("$D4")
    expect(formula).toContain("$E4")
    expect(formula).toContain("$H4")
  })
})

describe("buildCampaignAutoNameFormula", () => {
  it("matches live Campaign Builder layout", () => {
    const formula = buildCampaignAutoNameFormula(CAMPAIGN_HEADERS, 4)
    expect(formula).toContain("$A4")
    expect(formula).toContain("UPPER($B4)")
    expect(formula).toContain("LOWER($C4)")
    expect(formula).toContain("$I4")
  })
})

describe("buildAdSetAutoNameFormula", () => {
  it("matches live Ad Set Builder layout", () => {
    const formula = buildAdSetAutoNameFormula(AD_SET_HEADERS, 4)
    expect(formula).toContain("$A4")
    expect(formula).toContain("LOWER($D4)")
    expect(formula).toContain("$E4")
  })
})
