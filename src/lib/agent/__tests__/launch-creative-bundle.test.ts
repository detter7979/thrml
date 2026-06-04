import { describe, expect, it } from "vitest"

import {
  canLaunchAsPlacementBundle,
  selectPlacementBundleAssets,
} from "@/lib/agent/launch-creative-bundle"

describe("canLaunchAsPlacementBundle", () => {
  const base = {
    brief_id: "brief-1",
    asset_type: "image",
    generation_tool: "replicate",
    variation_label: "A",
    status: "approved",
    meta_ad_id: null,
  }

  it("returns true for same brief/variation with distinct formats", () => {
    expect(
      canLaunchAsPlacementBundle([
        { ...base, id: "1", format: "1x1" },
        { ...base, id: "2", format: "9x16" },
        { ...base, id: "3", format: "4x5" },
      ])
    ).toBe(true)
  })

  it("returns false for mixed variations", () => {
    expect(
      canLaunchAsPlacementBundle([
        { ...base, id: "1", format: "1x1", variation_label: "A" },
        { ...base, id: "2", format: "9x16", variation_label: "B" },
      ])
    ).toBe(false)
  })

  it("selects the largest same-variation format set", () => {
    const picked = selectPlacementBundleAssets([
      { ...base, id: "1", format: "1x1" },
      { ...base, id: "2", format: "9x16" },
      { ...base, id: "3", format: "4x5" },
      { ...base, id: "4", format: "1x1", variation_label: "B" },
    ])
    expect(picked.map((row) => row.format).sort()).toEqual(["1x1", "4x5", "9x16"])
  })
})
