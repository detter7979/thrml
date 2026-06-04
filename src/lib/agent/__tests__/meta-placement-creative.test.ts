import { describe, expect, it } from "vitest"

import { buildPlacementAssetFeedSpec } from "@/lib/agent/meta-placement-creative"

describe("buildPlacementAssetFeedSpec", () => {
  it("builds at least two customization rules for multi-format launch", () => {
    const spec = buildPlacementAssetFeedSpec({
      images: [
        { format: "1x1", imageHash: "hash1" },
        { format: "9x16", imageHash: "hash2" },
        { format: "4x5", imageHash: "hash3" },
      ],
      landingUrl: "https://usethrml.com/become-a-host",
      primaryCopy: "Primary",
      headline: "Headline",
      description: "Desc",
      brief: { cta: "List Your Space" },
    })

    expect(spec.images).toHaveLength(3)
    expect(spec.asset_customization_rules.length).toBeGreaterThanOrEqual(2)
    expect(spec.optimization_type).toBe("PLACEMENT")
    expect(spec.call_to_action_types[0]).toBe("SIGN_UP")
    const defaultRule = spec.asset_customization_rules.find(
      (rule) => (rule as { is_default?: boolean }).is_default
    ) as { image_label?: { name?: string } }
    expect(defaultRule?.image_label?.name).toBe("thrml_square")
  })

  it("uses facebook-only rules when Instagram is not configured", () => {
    const spec = buildPlacementAssetFeedSpec({
      images: [
        { format: "1x1", imageHash: "h1" },
        { format: "9x16", imageHash: "h2" },
      ],
      landingUrl: "https://usethrml.com/become-a-host",
      primaryCopy: "Primary",
      headline: "Headline",
      description: "Desc",
      brief: { cta: "List Your Space" },
      includeInstagram: false,
    })
    const storyRule = spec.asset_customization_rules.find(
      (rule) =>
        typeof rule === "object" &&
        rule &&
        (rule as { image_label?: { name?: string } }).image_label?.name === "thrml_story"
    ) as { customization_spec?: { publisher_platforms?: string[]; facebook_positions?: string[] } }
    expect(storyRule?.customization_spec?.publisher_platforms).toEqual(["facebook"])
    expect(storyRule?.customization_spec?.facebook_positions).toContain("story")
    expect(storyRule?.customization_spec?.facebook_positions).not.toContain("facebook_reels")
  })
})
