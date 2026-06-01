import { describe, it, expect } from "vitest"

import { parsePhotoEditInstructions } from "../static-photo-edit"

describe("parsePhotoEditInstructions", () => {
  it("detects flip 180 and keeps semantic cleanup", () => {
    const parsed = parsePhotoEditInstructions("flip 180 and remove the blurred dumbbells from the foreground")
    expect(parsed.geometric.rotate).toBe(180)
    expect(parsed.semanticPrompt).toMatch(/remove the blurred dumbbells/i)
  })

  it("detects horizontal flip", () => {
    const parsed = parsePhotoEditInstructions("flip horizontal, remove blurred deck railing")
    expect(parsed.geometric.flipHorizontal).toBe(true)
    expect(parsed.semanticPrompt).toMatch(/deck railing/i)
  })

  it("returns semantic-only prompt when no geometry", () => {
    const parsed = parsePhotoEditInstructions("Remove weights and other blurred foreground gym props")
    expect(parsed.geometric).toEqual({})
    expect(parsed.semanticPrompt).toMatch(/Remove weights/i)
  })
})
