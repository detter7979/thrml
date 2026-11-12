import { describe, expect, it } from "vitest"

import { estimateMonthlyHostEarnings } from "../host-landing-intro"

describe("estimateMonthlyHostEarnings", () => {
  it("applies the host fee to monthly gross", () => {
    // $40 × 4/week × 52/12 = $693.33 gross → 80% = $554.67
    expect(estimateMonthlyHostEarnings({ pricePerSession: 40, sessionsPerWeek: 4, hostFeePercent: 20 })).toBe(555)
  })

  it("returns gross when there is no fee", () => {
    expect(estimateMonthlyHostEarnings({ pricePerSession: 30, sessionsPerWeek: 1, hostFeePercent: 0 })).toBe(130)
  })
})
