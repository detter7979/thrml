import { describe, it, expect } from "vitest"

import {
  buildNamerCreativeRow,
  hookPreview,
  namerRowToSheetValues,
  pipelineTemplateFromBrief,
  splitFormatToken,
  briefInputProvenance,
} from "../namer-creative-append"

describe("splitFormatToken", () => {
  it("splits known static and video formats", () => {
    expect(splitFormatToken("Static_9x16")).toEqual(["Static", "NA", "9:16"])
    expect(splitFormatToken("Video_15s")).toEqual(["Video", "15s", "9:16"])
  })

  it("handles unknown static aspect ratios", () => {
    expect(splitFormatToken("Static_4x5")).toEqual(["Static", "NA", "4:5"])
  })
})

describe("hookPreview", () => {
  it("returns first three words", () => {
    expect(hookPreview("Turn your idle sauna into income")).toBe("Turn your idle")
  })
})

describe("briefInputProvenance", () => {
  it("marks manual briefs as human", () => {
    expect(
      briefInputProvenance({
        id: "b1",
        trigger_type: "manual",
        trigger_data: {},
        created_by: "admin",
        hook: null,
      })
    ).toBe("Human")
  })

  it("marks agent briefs as bot", () => {
    expect(
      briefInputProvenance({
        id: "b1",
        trigger_type: "agent",
        trigger_data: {},
        created_by: "agent",
        hook: null,
      })
    ).toBe("Bot")
  })
})

describe("buildNamerCreativeRow", () => {
  it("builds a Creative Builder row from convention_name", () => {
    const row = buildNamerCreativeRow(
      {
        id: "asset-uuid",
        brief_id: "brief-uuid",
        convention_name: "T05_A_pov_earnings_Static_9x16_list_now",
        gcs_path: "gs://thrml-creative/2026/05/hosts/pov_earnings/Static/A_9x16.png",
        gcs_url: "https://signed.example/a.png",
        format: "9x16",
        meta_ad_id: null,
        meta_adset_id: null,
        namer_synced_at: null,
      },
      {
        id: "brief-uuid",
        trigger_type: "manual",
        trigger_data: { template_id: "T1", naming: { test_id: "T05" } },
        created_by: "admin",
        hook: "Turn your idle sauna into income",
      },
      { campaignGen: "Pending", adSetGen: "Pending" },
      "https://signed.example/a.png"
    )

    expect(row).toMatchObject({
      testId: "T05",
      variant: "A",
      angle: "pov_earnings",
      formatType: "Static",
      aspectRatio: "9:16",
      cta: "list_now",
      adName: "T05_A_pov_earnings_Static_9x16_list_now",
      hookPreview: "Turn your idle",
      pipelineTemplate: "T1",
      assetUuid: "asset-uuid",
      briefInput: "Human",
      creativeGen: "Bot",
      campaignGen: "Pending",
      adSetGen: "Pending",
      assetGcsLink: "https://signed.example/a.png",
    })
  })

  it("returns null without convention_name", () => {
    expect(
      buildNamerCreativeRow(
        {
          id: "a",
          brief_id: "b",
          convention_name: null,
          gcs_path: null,
          gcs_url: null,
          format: null,
          meta_ad_id: null,
          meta_adset_id: null,
          namer_synced_at: null,
        },
        {
          id: "b",
          trigger_type: "manual",
          trigger_data: {},
          created_by: "admin",
          hook: null,
        },
        { campaignGen: "Pending", adSetGen: "Pending" },
        ""
      )
    ).toBeNull()
  })
})

describe("pipelineTemplateFromBrief", () => {
  it("reads template_id from trigger_data", () => {
    expect(
      pipelineTemplateFromBrief({
        id: "b",
        trigger_type: "manual",
        trigger_data: { template_id: "T3" },
        created_by: "admin",
        hook: null,
      })
    ).toBe("T3")
  })
})

describe("namerRowToSheetValues", () => {
  it("includes trailing metadata columns", () => {
    const row = buildNamerCreativeRow(
      {
        id: "asset-uuid",
        brief_id: "brief-uuid",
        convention_name: "T05_A_pov_earnings_Video_15s_list_now",
        gcs_path: "gs://thrml-creative/video.mp4",
        gcs_url: null,
        format: "9x16",
        meta_ad_id: null,
        meta_adset_id: null,
        namer_synced_at: null,
      },
      {
        id: "brief-uuid",
        trigger_type: "manual",
        trigger_data: { template_id: "T2" },
        created_by: "admin",
        hook: "pov: idle sauna",
      },
      { campaignGen: "Human", adSetGen: "Bot" },
      "gs://thrml-creative/video.mp4"
    )
    expect(row).not.toBeNull()
    const values = namerRowToSheetValues(row!)
    expect(values.at(-1)).toBe("Bot")
    expect(values.at(-2)).toBe("Human")
    expect(values.at(-6)).toBe("T2")
    expect(values.at(-7)).toBe("gs://thrml-creative/video.mp4")
  })
})
