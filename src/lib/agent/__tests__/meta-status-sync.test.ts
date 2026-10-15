import { describe, expect, it } from "vitest"

import { nextStatus } from "@/lib/agent/meta-status-sync"

describe("nextStatus", () => {
  it("marks live rows paused when Meta has them paused", () => {
    expect(nextStatus("TEST", "PAUSED")).toBe("PAUSED")
    expect(nextStatus("SCALE", "CAMPAIGN_PAUSED")).toBe("PAUSED")
    expect(nextStatus("TEST", "ADSET_PAUSED")).toBe("PAUSED")
  })
  it("brings paused rows back when Meta is active, keeps live rows as they are", () => {
    expect(nextStatus("PAUSED", "ACTIVE")).toBe("TEST")
    expect(nextStatus("SCALE", "ACTIVE")).toBeNull()
  })
  it("archives deleted objects, never touches drafts or kills", () => {
    expect(nextStatus("TEST", "DELETED")).toBe("ARCHIVED")
    expect(nextStatus("DRAFT", "PAUSED")).toBeNull()
    expect(nextStatus("KILLED", "ACTIVE")).toBeNull()
  })
  it("leaves review/error states for a human", () => {
    expect(nextStatus("TEST", "PENDING_REVIEW")).toBeNull()
    expect(nextStatus("TEST", "DISAPPROVED")).toBeNull()
  })
})
