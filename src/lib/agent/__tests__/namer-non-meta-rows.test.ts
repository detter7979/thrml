import { describe, expect, it } from "vitest"

import { isNonMetaRow, type NonMetaRows } from "@/lib/agent/namer-sync"
import { compareTokenValue } from "@/lib/agent/namer-token-library-sync"

describe("namer-sync skips non-Meta rows", () => {
  it("skips a Google campaign and everything under it", () => {
    const nonMeta: NonMetaRows = { campaigns: new Set(), adSets: new Set() }
    const campHeaders = ["Camp ID", "PLATFORM", "Platform Camp ID", "STATUS"]
    expect(isNonMetaRow("campaign", ["C001", "META", "1", "TEST"], campHeaders, "C001", nonMeta)).toBe(false)
    expect(isNonMetaRow("campaign", ["C019", "GOOG", "2", "PAUSED"], campHeaders, "C019", nonMeta)).toBe(true)

    const setHeaders = ["AdSet ID", "Camp ID", "Platform AdSet ID", "Status"]
    expect(isNonMetaRow("ad_set", ["AS001", "C001", "3", "TEST"], setHeaders, "AS001", nonMeta)).toBe(false)
    expect(isNonMetaRow("ad_set", ["AS034", "C019", "4", "DRAFT"], setHeaders, "AS034", nonMeta)).toBe(true)

    const adHeaders = ["Ad ID", "AdSet ID", "Campaign ID", "Status", "Platform Ad ID"]
    expect(isNonMetaRow("ad", ["AD001", "AS001", "C001", "TEST", "5"], adHeaders, "AD001", nonMeta)).toBe(false)
    expect(isNonMetaRow("ad", ["AD013", "AS034", "C019", "PAUSED", "6"], adHeaders, "AD013", nonMeta)).toBe(true)
  })
})

describe("token library compare", () => {
  it("matches FORMAT values regardless of case so they are not re-added", () => {
    expect(compareTokenValue("FORMAT", "Static_4x5")).toBe("static_4x5")
    expect(compareTokenValue("ANGLE", "Ease")).toBe("ease")
  })
})
