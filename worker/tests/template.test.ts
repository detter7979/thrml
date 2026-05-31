import { describe, it, expect } from "vitest"
import { templateV1, templateV2, getTemplate, DEFAULT_POV_SAUNA_TEMPLATE_VERSION } from "../src/template.js"
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

  it("v2 is POV centered overlay without scrim or logo", () => {
    expect(templateV2.version).toBe(2)
    expect(templateV2.textTopRatio).toBe(0.54)
    expect(templateV2.fontSizeRatio).toBe(0.0328)
    expect(templateV2.showGradient).toBe(false)
    expect(templateV2.showLogo).toBe(false)
    expect(templateV2.fontPath).toBe("assets/DMSerifDisplay-Regular.ttf")
  })

  it("getTemplate returns v1 and v2", () => {
    expect(getTemplate(1)).toBe(templateV1)
    expect(getTemplate(2)).toBe(templateV2)
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
    expect(filter).toContain("y=(h*0.54)-text_h-6")
    expect(filter).toContain("y=(h*0.54)+6")
    expect(filter).toContain("x=(w-text_w)/2")
    expect(filter).toContain("fontsize=h*0.0328")
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
