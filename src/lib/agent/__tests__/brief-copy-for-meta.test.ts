import { describe, expect, it } from "vitest"

import { hasResolvableLaunchCopy, resolveBriefCopyForMeta } from "@/lib/agent/brief-copy-for-meta"

describe("resolveBriefCopyForMeta", () => {
  it("fills copy from svg HEADLINE when brief columns are empty", () => {
    const resolved = resolveBriefCopyForMeta({
      hook: "Host earnings block split",
      trigger_data: {
        naming: { cta: "list_now" },
        svg_tokens: { HEADLINE: "Turn your idle sauna into income." },
      },
    })
    expect(resolved.copy_headline).toBe("Turn your idle sauna into income.")
    expect(resolved.copy_primary.length).toBeGreaterThan(10)
    expect(resolved.cta).toBe("List Your Space")
    expect(hasResolvableLaunchCopy({ trigger_data: { svg_tokens: { HEADLINE: "Earn." } } })).toBe(true)
  })
})
