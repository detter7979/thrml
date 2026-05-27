import { describe, expect, it } from "vitest"

import {
  assertPublishableListingCopy,
  findHostClaimViolations,
  formatHostClaimError,
} from "@/lib/listings/host-claim-policy"

describe("host-claim-policy", () => {
  it("allows experience-framed copy", () => {
    expect(
      findHostClaimViolations({
        title: "Private infrared room in Capitol Hill",
        description:
          "A calm, low-lit room for a quiet reset between meetings or after a workout. Book by the hour on your schedule.",
      })
    ).toEqual([])
  })

  it("blocks medical and efficacy claims in descriptions", () => {
    const violations = findHostClaimViolations({
      description: "This sauna cures my back pain and promotes recovery while improving skin appearance.",
    })

    expect(violations.length).toBeGreaterThan(0)
    expect(violations.some((violation) => violation.matched.includes("cures"))).toBe(true)
    expect(violations.some((violation) => violation.label.includes("recovery"))).toBe(true)
    expect(violations.some((violation) => violation.label.includes("skin"))).toBe(true)
  })

  it("blocks flagged red-light phrasing from the audit", () => {
    const violations = findHostClaimViolations({
      description:
        "Sessions promote recovery, improve skin appearance, and support muscle relaxation in a private room.",
    })

    expect(violations.map((violation) => violation.label)).toEqual(
      expect.arrayContaining([
        "recovery outcome claims",
        "skin improvement claims",
        "muscle relaxation claims",
      ])
    )
  })

  it("checks title and description together", () => {
    const result = assertPublishableListingCopy({
      title: "Pain relief sauna",
      description: "A warm cedar room with city views.",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("can't publish")
    }
  })

  it("formats a host-facing error message", () => {
    const message = formatHostClaimError(
      findHostClaimViolations({ description: "Clinically proven to reduce inflammation." })
    )

    expect(message).toContain("can't publish")
    expect(message).toContain("Avoid medical")
  })
})
