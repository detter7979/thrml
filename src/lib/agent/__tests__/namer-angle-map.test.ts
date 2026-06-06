import { describe, it, expect } from "vitest"

import { normalizeAngleForDb } from "../namer-angle-map"

describe("normalizeAngleForDb", () => {
  it("maps pipeline aliases to Postgres angle_t", () => {
    expect(normalizeAngleForDb("pov_earnings")).toBe("income")
    expect(normalizeAngleForDb("POV-Earnings")).toBe("income")
    expect(normalizeAngleForDb("idle")).toBe("idle_space")
    expect(normalizeAngleForDb("socialproof")).toBe("social_proof")
  })

  it("passes through valid angle_t values", () => {
    expect(normalizeAngleForDb("thermal")).toBe("thermal")
    expect(normalizeAngleForDb("COMMUNITY")).toBe("community")
  })

  it("defaults unknown angles to income", () => {
    expect(normalizeAngleForDb("")).toBe("income")
    expect(normalizeAngleForDb("mystery_angle")).toBe("income")
  })
})
