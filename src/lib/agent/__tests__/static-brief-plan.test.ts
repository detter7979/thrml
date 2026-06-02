import { describe, it, expect } from "vitest"

import {
  STANDARD_PHOTO_STATIC_FORMATS,
  buildOutFormatsForAsset,
  isConceptVerifyBrief,
  missingFormatsForVariation,
  nextVariationLabelsForBrief,
  previewFormatForBrief,
  targetFormatsForBrief,
} from "../static-brief-plan"

describe("static-brief-plan", () => {
  it("detects concept verify briefs", () => {
    expect(isConceptVerifyBrief({ trigger_data: { concept_verify: true } })).toBe(true)
    expect(isConceptVerifyBrief({ success_criteria: { concept_verify: true } })).toBe(true)
    expect(isConceptVerifyBrief({ success_criteria: { concept_verify: false } })).toBe(false)
  })

  it("resolves target and preview formats from success criteria", () => {
    const brief = {
      format: "1x1,9x16",
      success_criteria: { formats: ["1x1", "9x16", "4x5"], preview_format: "1x1" },
    }
    expect(targetFormatsForBrief(brief)).toEqual(["1x1", "9x16", "4x5"])
    expect(previewFormatForBrief(brief)).toBe("1x1")
  })

  it("finds missing build-out formats for a variation", () => {
    const brief = {
      format: "1x1,9x16",
      success_criteria: { formats: ["1x1", "9x16"] },
      trigger_data: { template_id: "T1" },
    }
    const assets = [{ format: "1x1", variation_label: "A" }]
    expect(buildOutFormatsForAsset(brief, assets[0], assets)).toEqual(["9x16", "4x5"])
    expect(missingFormatsForVariation(targetFormatsForBrief(brief), assets, "A")).toEqual(["9x16", "4x5"])
  })

  it("adds standard photo sizes for T1-style briefs but not SVG templates", () => {
    const photoBrief = {
      format: "1x1,9x16",
      success_criteria: { formats: ["1x1", "9x16"], preview_format: "1x1" },
      trigger_data: { template_id: "T1" },
    }
    expect(targetFormatsForBrief(photoBrief)).toEqual(STANDARD_PHOTO_STATIC_FORMATS)

    const svgBrief = {
      format: "1x1,9x16",
      success_criteria: { formats: ["1x1", "9x16"], preview_format: "1x1" },
      trigger_data: { svg_template_id: "thrml_split_header_static" },
    }
    expect(targetFormatsForBrief(svgBrief)).toEqual(["1x1", "9x16"])
  })

  it("lists pending variation labels without preview assets", () => {
    const brief = { format: "1x1,9x16", success_criteria: { formats: ["1x1", "9x16"], preview_format: "1x1" } }
    const assets = [{ format: "1x1", variation_label: "A" }]
    expect(nextVariationLabelsForBrief(brief, assets, ["A", "B", "C"])).toEqual(["B", "C"])
  })
})
