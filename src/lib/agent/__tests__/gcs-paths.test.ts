import { describe, it, expect } from "vitest"
import { baseVideoPath, renderedVideoPath } from "../gcs-paths"

describe("gcs-paths", () => {
  const may2026 = new Date("2026-05-19T00:00:00Z")

  it("builds uploaded base path", () => {
    expect(
      baseVideoPath({
        date: may2026,
        conceptSlug: "sauna-pov-earnings",
        assetSlug: "sauna",
        source: "uploaded",
        version: 1,
      })
    ).toBe("bases/2026/05/sauna-pov-earnings/sauna_v1.mp4")
  })

  it("builds runway base path", () => {
    expect(
      baseVideoPath({
        date: may2026,
        conceptSlug: "sauna-pov-earnings",
        assetSlug: "sauna",
        source: "runway",
        taskId: "abc123",
      })
    ).toBe("bases/2026/05/sauna-pov-earnings/sauna_runway_abc123.mp4")
  })

  it("throws if runway source missing taskId", () => {
    expect(() =>
      baseVideoPath({
        date: may2026,
        conceptSlug: "x",
        assetSlug: "y",
        source: "runway",
      })
    ).toThrow(/taskId required/)
  })

  it("builds rendered path", () => {
    expect(
      renderedVideoPath({
        date: may2026,
        conceptSlug: "sauna-pov-earnings",
        variantSlug: "pov-earn-1000",
        templateVersion: 1,
      })
    ).toBe("renders/2026/05/sauna-pov-earnings/pov-earn-1000_v1.mp4")
  })
})
