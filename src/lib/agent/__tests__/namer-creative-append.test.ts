import { describe, it, expect } from "vitest"

import {
  buildNamerCreativeRow,
  findCreativeBuilderHeader,
  formatHookCopy,
  hookCopyFromBrief,
  hookPreview,
  normalizeNamerGcsPath,
  normalizeTestId,
  namerRowToSheetValues,
  pipelineTemplateFromBrief,
  sizeFromFormatToken,
  splitFormatToken,
  videoLengthDisplay,
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

describe("sizeFromFormatToken", () => {
  it("extracts size from static format token", () => {
    expect(sizeFromFormatToken("Static_9x16", "9:16")).toBe("9x16")
    expect(sizeFromFormatToken("Static_4x5", "4:5")).toBe("4x5")
  })

  it("uses aspect ratio for video tokens", () => {
    expect(sizeFromFormatToken("Video_15s", "9:16")).toBe("9x16")
  })
})

describe("videoLengthDisplay", () => {
  it("returns duration for video and NA for static", () => {
    expect(videoLengthDisplay("Video", "15s")).toBe("15s")
    expect(videoLengthDisplay("Static", "NA")).toBe("NA")
  })
})

describe("hookCopyFromBrief", () => {
  it("prefers copy_headline over hook", () => {
    expect(
      hookCopyFromBrief(
        {
          id: "b",
          trigger_type: "manual",
          trigger_data: {},
          created_by: "admin",
          hook: "short hook",
          copy_headline: "Turn your idle sauna into income",
        },
        "ad_builder"
      )
    ).toBe("Turn your idle sauna into income")
  })

  it("falls back to svg HEADLINE token", () => {
    expect(
      hookCopyFromBrief(
        {
          id: "b",
          trigger_type: "manual",
          trigger_data: { svg_tokens: { HEADLINE: "Turn your idle sauna into income." } },
          created_by: "admin",
          hook: "Host earnings block split",
          copy_headline: null,
        },
        "ad_builder"
      )
    ).toBe("Turn your idle sauna into income.")
  })
})

describe("normalizeNamerGcsPath", () => {
  it("keeps gs:// paths clean", () => {
    expect(normalizeNamerGcsPath("gs://thrml/2026/06/hosts/pov_earnings/Static/A_9x16.png")).toBe(
      "gs://thrml/2026/06/hosts/pov_earnings/Static/A_9x16.png"
    )
  })

  it("strips signed URL query params", () => {
    expect(
      normalizeNamerGcsPath(
        "https://storage.googleapis.com/thrml/2026/06/hosts/pov_earnings/Static/A_9x16.png?X-Goog-Signature=abc"
      )
    ).toBe("gs://thrml/2026/06/hosts/pov_earnings/Static/A_9x16.png")
  })
})

describe("formatHookCopy", () => {
  it("uses full hook for ad_builder with ellipsis", () => {
    const long = "Turn your idle sauna into a steady monthly income stream on thrml"
    expect(formatHookCopy(long, "ad_builder")).toBe("Turn your idle sauna into a steady mont…")
  })

  it("uses first three words for creative_builder", () => {
    expect(formatHookCopy("Turn your idle sauna into income", "creative_builder")).toBe("Turn your idle")
  })
})

describe("normalizeTestId", () => {
  it("zero-pads test ids", () => {
    expect(normalizeTestId("T5")).toBe("T05")
    expect(normalizeTestId("T05")).toBe("T05")
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
        hook: "Host earnings block split",
        copy_headline: "Turn your idle sauna into income",
      },
      { campaignGen: "Pending", adSetGen: "Pending" },
      { gcsPath: "gs://thrml-creative/2026/05/hosts/pov_earnings/Static/A_9x16.png", signedUrl: "https://signed.example/a.png" },
      "ad_builder"
    )

    expect(row).toMatchObject({
      testId: "T05",
      variant: "A",
      angle: "pov_earnings",
      formatType: "Static",
      sizeToken: "9x16",
      videoLength: "NA",
      aspectRatio: "9:16",
      cta: "list_now",
      adName: "T05_A_pov_earnings_Static_9x16_list_now",
      hookPreview: "Turn your idle sauna into income",
      status: "TEST",
      assetGcsPath: "gs://thrml-creative/2026/05/hosts/pov_earnings/Static/A_9x16.png",
      pipelineTemplate: "T1",
      assetUuid: "asset-uuid",
      briefInput: "Human",
      creativeGen: "Bot",
      campaignGen: "Pending",
      adSetGen: "Pending",
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
          copy_headline: null,
        },
        { campaignGen: "Pending", adSetGen: "Pending" },
        { gcsPath: "", signedUrl: "" }
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
        copy_headline: null,
      })
    ).toBe("T3")
  })
})

describe("findCreativeBuilderHeader", () => {
  it("detects thrml_namer_v4 Ad Builder headers", () => {
    const rows = [
      ["Ad Builder"],
      ["→ Supabase: ads table"],
      [
        "Ad ID",
        "AdSet ID",
        "Campaign Name (ref)",
        "TEST",
        "VAR",
        "ANGLE",
        "FORMAT",
        "CTA",
        "Ad Name (auto)",
        "Platform Ad ID",
        "GCS Path",
        "Hook Copy",
        "Status",
      ],
    ]
    expect(findCreativeBuilderHeader(rows)).toMatchObject({
      headerRow: 2,
      layout: "ad_builder",
    })
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
        copy_headline: null,
      },
      { campaignGen: "Human", adSetGen: "Bot" },
      { gcsPath: "gs://thrml-creative/video.mp4", signedUrl: "gs://thrml-creative/video.mp4" }
    )
    expect(row).not.toBeNull()
    const values = namerRowToSheetValues(row!)
    expect(values.at(-1)).toBe("Bot")
    expect(values.at(-2)).toBe("Human")
    expect(values.at(-6)).toBe("T2")
    expect(values.at(-7)).toBe("gs://thrml-creative/video.mp4")
  })
})
