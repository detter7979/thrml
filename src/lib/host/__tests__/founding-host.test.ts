import { describe, expect, it } from "vitest"

import { foundingFeeStatus, resolveHostFeePercent } from "../founding-host"

const now = new Date("2027-01-15T12:00:00Z")
const base = { globalHostFeePercent: 20, foundingFeePercent: 10, now }

describe("resolveHostFeePercent", () => {
  it("uses the global fee for regular hosts", () => {
    expect(resolveHostFeePercent({ ...base, profile: { founding_host: false } })).toEqual({
      hostFeePercent: 20,
      foundingRateApplied: false,
      windowNotStarted: false,
    })
    expect(resolveHostFeePercent({ ...base, profile: null }).hostFeePercent).toBe(20)
  })

  it("applies the founding rate before the window starts (first booking)", () => {
    expect(resolveHostFeePercent({ ...base, profile: { founding_host: true } })).toEqual({
      hostFeePercent: 10,
      foundingRateApplied: true,
      windowNotStarted: true,
    })
  })

  it("applies the founding rate inside the window", () => {
    const r = resolveHostFeePercent({
      ...base,
      profile: { founding_host: true, founding_fee_expires_at: "2027-02-01T00:00:00Z" },
    })
    expect(r.hostFeePercent).toBe(10)
    expect(r.windowNotStarted).toBe(false)
  })

  it("falls back to the global fee after the window", () => {
    const r = resolveHostFeePercent({
      ...base,
      profile: { founding_host: true, founding_fee_expires_at: "2027-01-15T11:59:59Z" },
    })
    expect(r).toEqual({ hostFeePercent: 20, foundingRateApplied: false, windowNotStarted: false })
  })

  it("never charges more than the global fee", () => {
    const r = resolveHostFeePercent({
      ...base,
      globalHostFeePercent: 8,
      profile: { founding_host: true },
    })
    expect(r.hostFeePercent).toBe(8)
  })
})

describe("foundingFeeStatus", () => {
  const settings = { feePercent: 10, cap: 25, windowDays: 90 }

  it("reports each state", () => {
    expect(foundingFeeStatus({ profile: null, settings, now }).kind).toBe("none")
    expect(foundingFeeStatus({ profile: { founding_host: true }, settings, now }).kind).toBe("pending")
    expect(
      foundingFeeStatus({
        profile: { founding_host: true, founding_fee_expires_at: "2027-01-01T00:00:00Z" },
        settings,
        now,
      }).kind
    ).toBe("ended")
  })

  it("counts days left", () => {
    const status = foundingFeeStatus({
      profile: { founding_host: true, founding_fee_expires_at: "2027-01-25T12:00:00Z" },
      settings,
      now,
    })
    expect(status).toMatchObject({ kind: "active", daysLeft: 10 })
  })
})
