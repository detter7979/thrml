import { describe, it, expect } from "vitest"

import {
  getCreativeTemplate,
  buildBriefFromTemplate,
  loadCreativeTemplates,
} from "../creative-templates"

describe("creative-templates", () => {
  it("loads eight active templates (T1–T5, T9–T11)", () => {
    const templates = loadCreativeTemplates()
    expect(templates.length).toBe(8)
    expect(templates.map((t) => t.id)).toEqual(["T1", "T2", "T3", "T4", "T5", "T9", "T10", "T11"])
  })

  it("T06 presets map to the launch test angles and CTAs", () => {
    const expected = { T9: ["idle_space", "list_now"], T10: ["urgency", "list_now"], T11: ["income", "learn_more"] }
    for (const [id, [angle, cta]] of Object.entries(expected)) {
      const t = getCreativeTemplate(id)!
      expect(t.angle).toBe(angle)
      expect(t.naming).toMatchObject({ test_id: "T06", cta })
    }
  })

  it("no template carries an earnings-average claim", () => {
    for (const t of loadCreativeTemplates()) {
      expect(JSON.stringify(t)).not.toMatch(/\$\d|average of/i)
    }
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

  it("builds block split upload video brief with JSON overlay copy", () => {
    const t5 = getCreativeTemplate("T5")
    expect(t5).toBeDefined()
    const brief = buildBriefFromTemplate(t5!, { conceptVerify: true })
    expect(brief.video_config?.templateVersion).toBe(3)
    expect(brief.video_config?.copyVariants[0]?.copy).toContain('"headline"')
    expect(brief.trigger_data).toMatchObject({
      video_layout: "block_split",
      template_id: "T5",
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
    expect(getCreativeTemplate("T6")).toBeUndefined()
    expect(getCreativeTemplate("T7")).toBeUndefined()
    expect(getCreativeTemplate("T8")).toBeUndefined()
  })
})
