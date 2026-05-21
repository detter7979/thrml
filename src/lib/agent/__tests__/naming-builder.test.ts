import { describe, it, expect } from "vitest"
import { buildAdName, parseAdName, InvalidAdNameError } from "../naming-builder"

describe("buildAdName", () => {
  it("builds a valid ad name", () => {
    expect(
      buildAdName({
        testId: "T05",
        variant: "A",
        angle: "pov_earnings",
        format: "Video_15s",
        cta: "list_now",
      })
    ).toBe("T05_A_pov_earnings_Video_15s_list_now")
  })

  it("handles single-word angle", () => {
    expect(
      buildAdName({
        testId: "T01",
        variant: "A",
        angle: "income",
        format: "Static_9x16",
        cta: "list_now",
      })
    ).toBe("T01_A_income_Static_9x16_list_now")
  })

  it("handles multi-token angle with digits", () => {
    expect(
      buildAdName({
        testId: "T03",
        variant: "B",
        angle: "earnings_1000",
        format: "Video_30s",
        cta: "get_started",
      })
    ).toBe("T03_B_earnings_1000_Video_30s_get_started")
  })

  it.each([
    ["testId", "t05", /testId/],
    ["testId", "T5", /testId/],
    ["variant", "E", /variant/],
    ["variant", "AA", /variant/],
    ["angle", "POV_Earnings", /angle/],
    ["format", "video_15s", /format/],
    ["format", "Video", /format/],
    ["cta", "List_Now", /cta/],
  ])("rejects invalid %s = %s", (field, badValue, expectedMessage) => {
    const valid = {
      testId: "T05",
      variant: "A",
      angle: "pov",
      format: "Video_15s",
      cta: "list_now",
    }
    expect(() => buildAdName({ ...valid, [field]: badValue })).toThrow(InvalidAdNameError)
    expect(() => buildAdName({ ...valid, [field]: badValue })).toThrow(expectedMessage)
  })
})

describe("parseAdName", () => {
  it("parses a valid name", () => {
    expect(parseAdName("T05_A_pov_earnings_Video_15s_list_now")).toEqual({
      testId: "T05",
      variant: "A",
      angle: "pov_earnings",
      format: "Video_15s",
      cta: "list_now",
    })
  })

  it("handles single-token angle and cta", () => {
    expect(parseAdName("T01_A_income_Static_9x16_list_now")).toEqual({
      testId: "T01",
      variant: "A",
      angle: "income",
      format: "Static_9x16",
      cta: "list_now",
    })
  })

  it("round-trips", () => {
    const name = "T07_C_idle_space_summer_Carousel_1x1_book_now"
    const parsed = parseAdName(name)!
    expect(parsed).not.toBeNull()
    expect(buildAdName(parsed)).toBe(name)
  })

  it("returns null for malformed names", () => {
    expect(parseAdName("not_a_name")).toBeNull()
    expect(parseAdName("T05_E_angle_Video_15s_cta")).toBeNull()
    expect(parseAdName("T05_A_angle_Unknown_15s_cta")).toBeNull()
  })
})
