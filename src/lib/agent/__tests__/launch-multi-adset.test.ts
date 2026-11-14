import { describe, expect, it } from "vitest"

import {
  assetLaunchRecords,
  canLaunchAsPlacementBundle,
  stripLegacyAdPrefix,
  primaryBundleFormatRank,
  selectPlacementBundleAssets,
  validatePlacementBundle,
  type LaunchableAssetRow,
} from "../launch-creative-bundle"

const asset = (over: Partial<LaunchableAssetRow>): LaunchableAssetRow =>
  ({
    id: "a",
    brief_id: "b1",
    asset_type: "image",
    generation_tool: "svg_template",
    variation_label: "A",
    format: "4x5",
    status: "approved",
    meta_ad_id: null,
    ...over,
  }) as LaunchableAssetRow

describe("relaunching a creative into more ad sets", () => {
  it("keeps already-launched sizes launchable as one bundle", () => {
    const rows = [
      asset({ id: "a", format: "4x5", meta_ad_id: "111" }),
      asset({ id: "b", format: "9x16", meta_ad_id: "111" }),
    ]
    expect(validatePlacementBundle(rows)).toBeNull()
    expect(canLaunchAsPlacementBundle(rows)).toBe(true)
    expect(selectPlacementBundleAssets(rows).map((r) => r.id).sort()).toEqual(["a", "b"])
  })

  it("still requires approval", () => {
    expect(
      validatePlacementBundle([asset({ format: "4x5" }), asset({ id: "b", format: "9x16", status: "generated" })]),
    ).toMatch(/approved/)
  })

  it("reads launch records and ignores junk", () => {
    expect(
      assetLaunchRecords({
        launches: [{ adset_id: "s1", meta_ad_id: "m1", legacy_ad_id: "AD001", launched_at: "x" }, { nope: 1 }, null],
      }),
    ).toHaveLength(1)
    expect(assetLaunchRecords(null)).toEqual([])
  })

  it("names the ad after the 4x5 asset", () => {
    expect(primaryBundleFormatRank("4x5")).toBeLessThan(primaryBundleFormatRank("9x16"))
  })

  it("drops a stale AD### from a convention name", () => {
    expect(stripLegacyAdPrefix("AD023_T01_A_idle_space_Static_4x5_list_now")).toBe(
      "T01_A_idle_space_Static_4x5_list_now",
    )
    expect(stripLegacyAdPrefix("T01_A_ease_Static_4x5_list_now")).toBe("T01_A_ease_Static_4x5_list_now")
  })
})
