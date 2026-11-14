import { describe, expect, it } from "vitest"

import { nextTestId } from "../evaluator/next-test-id"

describe("nextTestId", () => {
  it("increments the namer T-series", () => {
    expect(nextTestId("T01")).toBe("T02")
    expect(nextTestId("T09")).toBe("T10")
    expect(nextTestId("t5")).toBe("T06")
    expect(nextTestId("T99")).toBe("T100")
  })
  it("handles missing or odd ids", () => {
    expect(nextTestId(null)).toBe("T01")
    expect(nextTestId("brand")).toBe("brand-next")
  })
})
