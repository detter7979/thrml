import { describe, it, expect } from "vitest"

import {
  extractPipelineTokens,
  normalizeFormatTokenValue,
  normalizePipelineTokenValue,
} from "../namer-token-library-sync"
import type { NamerCreativeRow } from "../namer-creative-append"

const baseRow: NamerCreativeRow = {
  adId: "AD001",
  adSetId: "",
  campaignId: "",
  testId: "T01",
  variant: "A",
  angle: "pov_earnings",
  formatToken: "Static_9x16",
  formatType: "Static",
  sizeToken: "9x16",
  length: "NA",
  videoLength: "NA",
  aspectRatio: "9:16",
  cta: "list_now",
  adName: "AD001_T01_A_pov_earnings_Static_9x16_list_now",
  hookPreview: "Turn your idle",
  status: "TEST",
  platform: "",
  phase: "",
  optEvent: "",
  assetGcsPath: "gs://thrml/test.png",
  assetGcsLink: "",
  pipelineTemplate: "T4",
  assetUuid: "uuid",
  briefInput: "Human",
  creativeGen: "Bot",
  campaignGen: "Pending",
  adSetGen: "Pending",
}

describe("normalizePipelineTokenValue", () => {
  it("normalizes hyphens and case", () => {
    expect(normalizePipelineTokenValue("POV-Earnings")).toBe("pov_earnings")
  })
})

describe("normalizeFormatTokenValue", () => {
  it("preserves Static and Video casing", () => {
    expect(normalizeFormatTokenValue("static_9x16")).toBe("Static_9x16")
    expect(normalizeFormatTokenValue("VIDEO_5S")).toBe("Video_5s")
  })
})

describe("extractPipelineTokens", () => {
  it("extracts angle, cta, and format from a creative row", () => {
    const tokens = extractPipelineTokens(baseRow, { hook: "Turn your idle sauna into income" })
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "ANGLE", value: "pov_earnings", status: "TEST" }),
        expect.objectContaining({ category: "CTA", value: "list_now" }),
        expect.objectContaining({ category: "FORMAT", value: "Static_9x16" }),
      ])
    )
    const angle = tokens.find((t) => t.category === "ANGLE")
    expect(angle?.definition).toContain("Turn your idle sauna")
  })

  it("registers novel video format tokens", () => {
    const tokens = extractPipelineTokens({
      ...baseRow,
      formatToken: "Video_5s",
      formatType: "Video",
      videoLength: "5s",
    })
    expect(tokens.find((t) => t.category === "FORMAT")).toMatchObject({
      value: "Video_5s",
      definition: "5s video (pipeline)",
    })
  })
})
