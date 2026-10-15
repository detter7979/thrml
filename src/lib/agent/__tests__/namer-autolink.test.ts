import { describe, expect, it } from "vitest"

import { convEventToDb, mapSheetStatusToDb } from "../namer-db-sync"
import { buildCampaignAutoNameFormula } from "../namer-sheet-formulas"
import { metaNamePrefix, pickAutoLink } from "../namer-sync"

describe("namer auto-link", () => {
  it("reads the ID prefix from Meta names", () => {
    expect(metaNamePrefix("AS002_int-income_FEED-STORIES")).toBe("AS002")
    expect(metaNamePrefix("c001_META_host")).toBe("C001")
    expect(metaNamePrefix("META_RT_checkout_no_purchase_7d")).toBe("")
  })

  it("scopes a reused ad set ID to its own campaign", () => {
    const cands = [
      { id: "111", parentPlatformId: "C1" },
      { id: "222", parentPlatformId: "C2" },
    ]
    expect(pickAutoLink(cands, "C1", new Set())).toBe("111")
    expect(pickAutoLink(cands, "C2", new Set())).toBe("222")
    expect(pickAutoLink(cands, null, new Set())).toBeNull() // ambiguous without a parent
    expect(pickAutoLink(cands, "C3", new Set())).toBeNull()
    expect(pickAutoLink([cands[0]!], null, new Set())).toBe("111")
    expect(pickAutoLink([cands[0]!], null, new Set(["111"]))).toBeNull()
  })
})

describe("namer db sync helpers", () => {
  it("maps Meta event names", () => {
    expect(convEventToDb("Lead")).toBe("LEAD")
    expect(convEventToDb("ViewContent")).toBe("VC")
    expect(convEventToDb("Purchase")).toBe("PUR")
    expect(convEventToDb("join_waitlist")).toBeNull()
  })
  it("keeps sheet statuses", () => {
    expect(mapSheetStatusToDb("paused")).toBe("PAUSED")
    expect(mapSheetStatusToDb("ARCHIVED")).toBe("ARCHIVED")
    expect(mapSheetStatusToDb("")).toBe("DRAFT")
  })
})

describe("campaign name formula", () => {
  it("appends VER when present", () => {
    const f = buildCampaignAutoNameFormula(["Camp ID", "PLATFORM", "EVENT", "LAUNCH", "VER"], 4)!
    expect(f).toContain('IF($E4="","","_"&LOWER($E4))')
  })
})
