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
  })
})
