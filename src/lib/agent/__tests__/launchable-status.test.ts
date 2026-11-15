import { describe, expect, it } from "vitest"

import { isLaunchableEffectiveStatus } from "@/lib/agent/meta-ads-api"

describe("isLaunchableEffectiveStatus", () => {
  it("keeps targets in any delivery state that still exists", () => {
    for (const status of ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW", null, undefined, ""]) {
      expect(isLaunchableEffectiveStatus(status)).toBe(true)
    }
  })

  it("drops deleted and archived targets", () => {
    expect(isLaunchableEffectiveStatus("DELETED")).toBe(false)
    expect(isLaunchableEffectiveStatus("archived")).toBe(false)
  })
})
