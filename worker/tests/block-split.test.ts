import { describe, it, expect } from "vitest"

import { parseBlockSplitVideoOverlay, wrapOverlayLine } from "../src/block-split-overlay.js"
import { buildBlockSplitFilterComplex } from "../src/block-split-renderer.js"
import { templateV3 } from "../src/template.js"

describe("block split overlay", () => {
  it("parses JSON copy payloads", () => {
    const overlay = parseBlockSplitVideoOverlay(
      JSON.stringify({
        taglineEyebrow: "PRIVATE WELLNESS, BY THE HOUR.",
        headline: "Turn your idle sauna into income.",
        subhead: "Backyard and cabin saunas in Seattle + LA.",
      }),
    )
    expect(overlay.headline).toContain("Turn your idle sauna")
  })

  it("wraps long headlines", () => {
    const lines = wrapOverlayLine("Turn your idle sauna into income.", 22, 2)
    expect(lines.length).toBeGreaterThan(1)
  })
})

describe("buildBlockSplitFilterComplex", () => {
  it("places video in bottom panel and stacks drawtext layers", () => {
    const { filter } = buildBlockSplitFilterComplex({
      template: templateV3,
      overlay: {
        taglineEyebrow: "PRIVATE WELLNESS, BY THE HOUR.",
        headline: "Turn your idle sauna into income.",
        subhead: "Backyard and cabin saunas in Seattle + LA.",
      },
      textFiles: {
        brand: "/tmp/block-brand.txt",
        eyebrow: "/tmp/block-eyebrow.txt",
        headlineLines: ["/tmp/block-headline-0.txt", "/tmp/block-headline-1.txt"],
        subhead: "/tmp/block-subhead.txt",
      },
    })

    expect(filter).toContain("scale=1080:1280")
    expect(filter).toContain("pad=1080:1920:0:640:color=0xC75B3A")
    expect(filter).not.toContain("color=c=0xC75B3A:s=")
    expect(filter).toContain("textfile='/tmp/block-headline-0.txt'")
    expect(filter).toContain("[out]")
  })
})
