import { describe, expect, it } from "vitest"

import { duplicateBriefRow, mergeBriefTriggerData, svgTokensForCopyRow } from "../brief-copy-sets"
import { structuredEditorFromBrief, structuredEditorToPatch } from "@/components/admin/creative/brief-editor-modal"

const svgBrief = {
  id: "b1",
  trigger_type: "manual",
  status: "variations_ready",
  hypothesis: null,
  target_audience: null,
  hook: "Your sauna sits empty most of the week.",
  format: "4x5,9x16",
  visual_direction: null,
  copy_primary: "Primary",
  copy_headline: "Let your sauna earn",
  copy_subtext: "Free to list",
  cta: "Sign Up",
  campaign_short_name: "host-launch",
  rationale: null,
  reference_image_urls: [],
  success_criteria: { variations: 2, concept_verify: false, formats: ["4x5", "9x16"] },
  trigger_data: {
    template_id: "T4",
    category: "Hosts",
    angle: "idle_space",
    svg_template_id: "thrml_block_split_static",
    photo_gcs_path: "creative/2026/hosts/sauna_01.jpg",
    naming: { test_id: "T06", format: "Static_4x5", cta: "list_now" },
    claim_warning: { violations: [] },
    svg_tokens: { TAGLINE_EYEBROW: "SEATTLE SAUNA OWNERS", SUBHEAD: "Free to list." },
    svg_variations: [
      {
        variation_label: "A",
        tokens: { TAGLINE_EYEBROW: "SEATTLE SAUNA OWNERS", SUBHEAD: "Free to list.", HEADLINE: "Headline A" },
      },
      {
        variation_label: "B",
        tokens: { TAGLINE_EYEBROW: "SEATTLE SAUNA OWNERS", SUBHEAD: "Other subhead", HEADLINE: "Headline B" },
      },
    ],
  },
}

describe("mergeBriefTriggerData", () => {
  it("keeps keys the editor does not send and drops nulls", () => {
    const merged = mergeBriefTriggerData(
      { template_id: "T4", category: "Hosts", photo_gcs_path: "a.jpg" },
      { angle: "urgency", photo_gcs_path: null },
    )
    expect(merged).toEqual({ template_id: "T4", category: "Hosts", angle: "urgency" })
  })
})

describe("duplicateBriefRow", () => {
  it("copies template, photo, sizes and naming but resets status and launch state", () => {
    const row = duplicateBriefRow(svgBrief)
    expect(row.id).toBeUndefined()
    expect(row.status).toBe("briefed")
    expect(row.parent_brief_id).toBe("b1")
    expect(row.format).toBe("4x5,9x16")
    const td = row.trigger_data as Record<string, unknown>
    expect(td.photo_gcs_path).toBe("creative/2026/hosts/sauna_01.jpg")
    expect(td.svg_template_id).toBe("thrml_block_split_static")
    expect(td.claim_warning).toBeUndefined()
  })
})

describe("per-version copy", () => {
  it("falls back to shared eyebrow/subhead when a version leaves them blank", () => {
    expect(
      svgTokensForCopyRow(
        { variation_label: "A", headline: "H", eyebrow: "", subhead: "Own subhead" },
        { eyebrow: "SHARED", subhead: "Shared subhead" },
      ),
    ).toEqual({ TAGLINE_EYEBROW: "SHARED", SUBHEAD: "Own subhead", HEADLINE: "H" })
  })

  it("round-trips photo and per-version overrides through the editor", () => {
    const state = structuredEditorFromBrief(svgBrief)
    expect(state.photo_gcs_path).toBe("creative/2026/hosts/sauna_01.jpg")
    expect(state.svg_variations[0]).toMatchObject({ headline: "Headline A", eyebrow: "", subhead: "" })
    expect(state.svg_variations[1]).toMatchObject({ headline: "Headline B", subhead: "Other subhead" })

    const patch = structuredEditorToPatch(state)
    const td = patch.trigger_data as Record<string, unknown>
    expect(td.photo_gcs_path).toBe("creative/2026/hosts/sauna_01.jpg")
    expect(td.svg_variations).toEqual(svgBrief.trigger_data.svg_variations)
  })

  it("clears the photo with null so the server merge removes it", () => {
    const state = { ...structuredEditorFromBrief(svgBrief), photo_gcs_path: "" }
    const td = structuredEditorToPatch(state).trigger_data as Record<string, unknown>
    expect(td.photo_gcs_path).toBeNull()
  })
})
