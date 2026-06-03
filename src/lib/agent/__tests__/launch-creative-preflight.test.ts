import { describe, expect, it } from "vitest"

import {
  META_LINK_DESCRIPTION_MAX,
  truncateForMetaLinkDescription,
} from "@/lib/agent/launch-creative-preflight"

describe("truncateForMetaLinkDescription", () => {
  it("leaves short subtext unchanged", () => {
    expect(truncateForMetaLinkDescription("Short line.")).toBe("Short line.")
  })

  it("truncates host proof line to Meta limit", () => {
    const raw = "Hosts on thrml earn an average of $1,200 / month."
    const out = truncateForMetaLinkDescription(raw)
    expect(out.length).toBeLessThanOrEqual(META_LINK_DESCRIPTION_MAX)
    expect(out.startsWith("Hosts on thrml earn")).toBe(true)
  })
})
