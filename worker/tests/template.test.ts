import { describe, it, expect } from "vitest"
import { templateV1, templateV2, templateV3, getTemplate, DEFAULT_POV_SAUNA_TEMPLATE_VERSION } from "../src/template.js"
import { buildFilterComplex } from "../src/renderer.js"

describe("template", () => {
  it("v1 has expected locked values", () => {
    expect(templateV1.version).toBe(1)
    expect(templateV1.width).toBe(720)
    expect(templateV1.height).toBe(1280)
    expect(templateV1.textColor).toBe("F5F0E8")
    expect(templateV1.fontPath).toBe("assets/DMSerifDisplay-Regular.ttf")
    expect(templateV1.showGradient).toBe(true)
    expect(templateV1.showLogo).toBe(true)
  })

  it("v2 is POV fascia overlay without scrim or logo", () => {
    expect(templateV2.version).toBe(2)
    expect(templateV2.textTopRatio).toBe(0.4)
    expect(templateV2.fontSizeRatio).toBe(0.0295)
    expect(templateV2.textLineSpacing).toBe(8)
    expect(templateV2.textLineHeightRatio).toBe(1.2)
    expect(templateV2.textOpacity).toBe(0.92)
    expect(templateV2.showGradient).toBe(false)
    expect(templateV2.showLogo).toBe(false)
    expect(templateV2.fontPath).toBe("assets/DMSerifDisplay-Regular.ttf")
  })

  it("getTemplate returns v1, v2, and v3", () => {
    expect(getTemplate(1)).toBe(templateV1)
    expect(getTemplate(2)).toBe(templateV2)
    expect(getTemplate(3)).toBe(templateV3)
  })

  it("default POV sauna template is v2", () => {
    expect(DEFAULT_POV_SAUNA_TEMPLATE_VERSION).toBe(2)
  })

  it("getTemplate throws on unknown version", () => {
    expect(() => getTemplate(99)).toThrow(/Unknown template version/)
  })
})

describe("buildFilterComplex", () => {
  it("v2 uses per-line centered drawtext and single input", () => {
    const { filter, inputs } = buildFilterComplex({
      template: templateV2,
      copyTextFile: "/tmp/overlay-copy.txt",
      copyLineFiles: ["/tmp/overlay-line-0.txt", "/tmp/overlay-line-1.txt"],
    })
    expect(inputs).toBe(1)
    expect(filter).toContain("textfile='/tmp/overlay-line-0.txt'")
    expect(filter).toContain("textfile='/tmp/overlay-line-1.txt'")
    expect(filter).toContain("y=(h*0.4)-text_h-(h*0.0295)*(1.2-1)/2")
    expect(filter).toContain("y=(h*0.4)-text_h-(h*0.0295)*(1.2-1)/2+(h*0.0295)*1.2")
    expect(filter).toContain("x=(w-text_w)/2")
    expect(filter).toContain("fontcolor=0xFFFFFF@0.92")
    expect(filter).toContain("fontsize=h*0.0295")
    expect(filter).not.toContain("text_align")
    expect(filter).not.toContain("fix_bounds")
    expect(filter).not.toContain("overlay=0:H-h:format=auto[bg]")
    expect(filter).not.toContain("[logo]")
  })

  it("v1 keeps gradient, logo, and fixed y", () => {
    const { filter, inputs } = buildFilterComplex({
      template: templateV1,
      copyTextFile: "/tmp/overlay-copy.txt",
    })
    expect(inputs).toBe(2)
    expect(filter).toContain("overlay=0:H-h:format=auto[bg]")
    expect(filter).toContain("y=546")
    expect(filter).toContain("[logo]")
  })
})

import { applyRenderOptions, parseRenderOptions, templateV2, templateV3 } from "../src/template.js"
import { buildFilterComplex } from "../src/renderer.js"
import { unifiedVideoRenderPath } from "../src/paths.js"

describe("render options from the brief", () => {
  it("leaves the template untouched when nothing is set", () => {
    expect(applyRenderOptions(templateV2, parseRenderOptions(null))).toEqual(templateV2)
    expect(applyRenderOptions(templateV2, parseRenderOptions({}))).toEqual(templateV2)
  })

  it("moves the text and clamps it to the safe zone", () => {
    expect(applyRenderOptions(templateV2, parseRenderOptions({ textPositionPct: 62.5 })).textTopRatio).toBe(0.625)
    expect(parseRenderOptions({ textPositionPct: 2 }).textPositionPct).toBe(12)
    expect(parseRenderOptions({ textPositionPct: 99 }).textPositionPct).toBe(85)
  })

  it("adds a logo sized from the video width with the chosen opacity and position", () => {
    const t = applyRenderOptions(templateV2, parseRenderOptions({ showLogo: true, logoOpacity: 0.4, logoPosition: "top" }))
    expect(t.showLogo).toBe(true)
    expect(t.logoOpacity).toBe(0.4)
    const { filter, inputs } = buildFilterComplex({ template: t, copyTextFile: "/tmp/copy.txt" })
    expect(inputs).toBe(2)
    expect(filter).toContain("colorchannelmixer=aa=0.4")
    expect(filter).toContain("scale2ref=w=iw*0.22")
    expect(filter).toContain("overlay=(W-w)/2:H*0.12")
  })

  it("skips the logo at zero opacity and ignores options on the block split template", () => {
    const t = applyRenderOptions(templateV2, parseRenderOptions({ showLogo: true, logoOpacity: 0 }))
    expect(buildFilterComplex({ template: t, copyTextFile: "/tmp/copy.txt" }).inputs).toBe(1)
    expect(applyRenderOptions(templateV3, { textPositionPct: 70, showLogo: true })).toBe(templateV3)
  })

  it("gives each re-render its own output file", () => {
    const base = { date: new Date("2026-11-15T00:00:00Z"), category: "Hosts", angleSlug: "pov_earnings", variantSlug: "pov-idle-income", templateVersion: 2 }
    expect(unifiedVideoRenderPath(base)).toBe("2026/11/hosts/pov_earnings/Video/composite/pov-idle-income_9x16_v2.mp4")
    expect(unifiedVideoRenderPath({ ...base, revision: 3 })).toBe("2026/11/hosts/pov_earnings/Video/composite/pov-idle-income_9x16_v2_r3.mp4")
  })
})
