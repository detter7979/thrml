import { describe, it, expect } from "vitest"
import {
  baseVideoPath,
  renderedVideoPath,
  unifiedStaticPath,
  unifiedVideoRenderPath,
} from "../gcs-paths"

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

  it("builds unified static path", () => {
    expect(
      unifiedStaticPath({
        date: may2026,
        category: "Hosts",
        angleSlug: "pov_earnings",
        variant: "A",
        format: "9x16",
      })
    ).toBe("2026/05/hosts/pov_earnings/Static/composite/A_9x16.png")
  })

  it("builds unified static path with template slug", () => {
    expect(
      unifiedStaticPath({
        date: may2026,
        category: "Hosts",
        angleSlug: "pov_earnings",
        variant: "A",
        format: "1x1",
        templateSlug: "block_split",
      })
    ).toBe("2026/05/hosts/pov_earnings/Static/composite/block_split/A_1x1.png")
  })

  it("builds unified video paths when category set", () => {
    expect(
      baseVideoPath({
        date: may2026,
        conceptSlug: "pov-earnings",
        assetSlug: "sauna",
        source: "uploaded",
        category: "Hosts",
        angleSlug: "pov_earnings",
      })
    ).toBe("2026/05/hosts/pov_earnings/Video/base/base_sauna_v1.mp4")

    expect(
      unifiedVideoRenderPath({
        date: may2026,
        category: "Hosts",
        angleSlug: "pov_earnings",
        variantSlug: "pov-earn-1000",
        templateVersion: 1,
      })
    ).toBe("2026/05/hosts/pov_earnings/Video/composite/pov-earn-1000_9x16_v1.mp4")
  })
})
