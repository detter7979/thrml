import { describe, expect, it } from "vitest"

import { fakeMonth, monthTabName } from "../year-statements"

describe("FSS year statements", () => {
  it("names month tabs so they sort", () => {
    expect(monthTabName("2026-10")).toBe("2026-10 Oct")
    expect(monthTabName("2026-01")).toBe("2026-01 Jan")
  })
  it("fake months add up like real ones", () => {
    const { result, detail } = fakeMonth("2026-09")
    expect(detail.bookings.length).toBe(result.marketplace.bookings)
    const refunds = detail.refunds.reduce((s, f) => s + f.amount, 0)
    expect(Math.abs(refunds - result.marketplace.refunds)).toBeLessThan(0.02)
    const b = result.bottomLine
    expect(Math.abs(b.net - (b.revenue - b.expenses - b.stripeFees))).toBeLessThan(0.02)
    expect(result.costs.lineItems.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(result.costs.total, 1)
    // Same month → same fake data (repeatable test).
    expect(fakeMonth("2026-09").result.bottomLine.net).toBe(b.net)
  })
})
