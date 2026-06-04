import { describe, expect, it } from "vitest"

import { statusAfterStaticGeneration } from "@/lib/agent/creative-brief-status"

describe("statusAfterStaticGeneration", () => {
  it("keeps briefed for unapproved drafts", () => {
    expect(statusAfterStaticGeneration(null)).toBe("briefed")
  })

  it("marks variations_ready after approval", () => {
    expect(statusAfterStaticGeneration("2026-06-02T00:00:00.000Z")).toBe("variations_ready")
  })
})
