import { describe, it, expect } from "vitest"

import {
  getCreativeTemplate,
  buildBriefFromTemplate,
  loadCreativeTemplates,
} from "../creative-templates"

describe("creative-templates", () => {
  it("loads four active templates (T1–T4)", () => {
    const templates = loadCreativeTemplates()
    expect(templates.length).toBe(4)
    expect(templates.map((t) => t.id)).toEqual(["T1", "T2", "T3", "T4"])
  })

  it("builds static brief with concept verify", () => {
    const t1 = getCreativeTemplate("T1")
    expect(t1).toBeDefined()
    const brief = buildBriefFromTemplate(t1!, { conceptVerify: true })
    expect(brief.video_config).toBeNull()
    expect(brief.format).toContain("1x1")
    expect(brief.success_criteria).toMatchObject({ variations: 1, concept_verify: true })
    expect(brief.trigger_data).toMatchObject({
      template_id: "T1",
      category: "Hosts",
      naming: expect.objectContaining({ template_slug: "pov_earns_photo" }),
    })
  })

  it("builds upload video brief with naming", () => {
    const t2 = getCreativeTemplate("T2")
    const brief = buildBriefFromTemplate(t2!, { conceptVerify: false })
    expect(brief.video_config?.source).toBe("uploaded")
    expect(brief.video_config?.naming?.testId).toBe("T05")
    expect(brief.video_config?.copyVariants.length).toBeGreaterThan(0)
  })

  it("does not include removed templates", () => {
    expect(getCreativeTemplate("T5")).toBeUndefined()
    expect(getCreativeTemplate("T6")).toBeUndefined()
    expect(getCreativeTemplate("T7")).toBeUndefined()
  })
})
