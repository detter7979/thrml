import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/stripe", () => ({ stripe: {} }))

import { monthRange, previousMonth } from "../monthly-reconciliation"

describe("monthly reconciliation dates", () => {
  it("covers the whole calendar month in UTC", () => {
    expect(monthRange("2026-09")).toMatchObject({ start: "2026-09-01", end: "2026-09-30" })
    expect(monthRange("2028-02")).toMatchObject({ start: "2028-02-01", end: "2028-02-29" })
    const r = monthRange("2026-12")
    expect(r.end).toBe("2026-12-31")
    expect(r.endTsExclusive - r.startTs).toBe(31 * 86400)
  })

  it("picks the previous month, including across a year boundary", () => {
    expect(previousMonth(new Date("2026-11-01T08:15:00Z"))).toBe("2026-10")
    expect(previousMonth(new Date("2027-01-01T08:15:00Z"))).toBe("2026-12")
  })

  it("rejects bad month strings", () => {
    expect(() => monthRange("2026-9")).toThrow()
  })
})
