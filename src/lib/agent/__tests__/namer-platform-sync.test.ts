import { describe, it, expect } from "vitest"

import {
  buildNamerCreativeRow,
  buildPlatformIdSheetUpdates,
} from "../namer-creative-append"

const AD_BUILDER_HEADERS = [
  "Ad ID",
  "Ad Set ID",
  "Campaign ID",
  "TEST",
  "VAR",
  "ANGLE",
  "FORMAT",
  "CTA",
  "Ad Name (auto)",
  "Platform Campaign ID",
  "Platform Ad Set ID",
  "Platform Ad ID",
  "GCS Path",
]

describe("buildPlatformIdSheetUpdates", () => {
  it("writes Meta IDs into Ad Builder platform columns", () => {
    const updates = buildPlatformIdSheetUpdates(
      AD_BUILDER_HEADERS,
      3,
      "Ad Builder",
      {
        adId: "120001",
        adSetId: "238002",
        campaignId: "440003",
      },
      "ad_builder"
    )
    expect(updates).toHaveLength(3)
    expect(updates.map((u) => u.range)).toEqual(
      expect.arrayContaining([
        "'Ad Builder'!J4",
        "'Ad Builder'!K4",
        "'Ad Builder'!L4",
      ])
    )
    expect(updates.find((u) => u.range.endsWith("L4"))?.values[0][0]).toBe("120001")
  })

  it("returns no updates when all IDs are empty", () => {
    expect(
      buildPlatformIdSheetUpdates(
        AD_BUILDER_HEADERS,
        2,
        "Ad Builder",
        { adId: "", adSetId: "", campaignId: "" },
        "ad_builder"
      )
    ).toEqual([])
  })
})

describe("buildNamerCreativeRow with platform IDs", () => {
  it("fills ad / ad set / campaign columns when provided at append time", () => {
    const row = buildNamerCreativeRow(
      {
        id: "asset-uuid",
        brief_id: "brief-uuid",
        convention_name: "T05_A_pov_earnings_Static_1x1_list_now",
        gcs_path: "gs://thrml-creative/square.png",
        gcs_url: null,
        format: "1x1",
        meta_ad_id: "120001",
        meta_adset_id: "238002",
        namer_synced_at: null,
      },
      {
        id: "brief-uuid",
        trigger_type: "manual",
        trigger_data: {},
        created_by: "admin",
        hook: null,
        copy_headline: null,
      },
      { campaignGen: "Human", adSetGen: "Bot" },
      { gcsPath: "gs://thrml-creative/square.png", signedUrl: "" },
      "ad_builder",
      { adId: "AD042", adSetId: "AS005", campaignId: "C003" }
    )
    expect(row?.adId).toBe("AD042")
    expect(row?.adSetId).toBe("AS005")
    expect(row?.campaignId).toBe("C003")
  })
})
