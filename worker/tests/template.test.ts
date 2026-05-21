import { describe, it, expect } from "vitest"
import { templateV1, getTemplate } from "../src/template.js"

describe("template", () => {
  it("v1 has expected locked values", () => {
    expect(templateV1.version).toBe(1)
    expect(templateV1.width).toBe(720)
    expect(templateV1.height).toBe(1280)
    expect(templateV1.textColor).toBe("F5F0E8")
    expect(templateV1.fontPath).toBe("assets/DMSerifDisplay-Regular.ttf")
  })

  it("getTemplate returns v1", () => {
    expect(getTemplate(1)).toBe(templateV1)
  })

  it("getTemplate throws on unknown version", () => {
    expect(() => getTemplate(99)).toThrow(/Unknown template version/)
  })
})
