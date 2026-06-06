import { describe, it, expect } from "vitest"

import {
  allocateNextThrmlLegacyId,
  formatThrmlLegacyId,
  parseThrmlLegacySequence,
} from "../namer-legacy-ids"

describe("namer legacy ids", () => {
  it("formats C001 / AS001 / AD001", () => {
    expect(formatThrmlLegacyId("campaign", 1)).toBe("C001")
    expect(formatThrmlLegacyId("ad_set", 12)).toBe("AS012")
    expect(formatThrmlLegacyId("ad", 99)).toBe("AD099")
  })

  it("allocates next id from sheet values", () => {
    expect(allocateNextThrmlLegacyId(["AD001", "AD002", "AD010"], "ad")).toBe("AD011")
    expect(allocateNextThrmlLegacyId(["C001", "C010"], "campaign")).toBe("C011")
  })

  it("parses sequences", () => {
    expect(parseThrmlLegacySequence("as007", "ad_set")).toBe(7)
    expect(parseThrmlLegacySequence("meta-123", "ad")).toBeNull()
  })
})
