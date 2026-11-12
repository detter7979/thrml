import { afterEach, describe, expect, it } from "vitest"

import {
  guestBookingsOpen,
  hasCompletedHostOnboarding,
  hostSignupHref,
  isHostFunnelPath,
  pickNoListingNudge,
} from "../host-funnel"

describe("isHostFunnelPath", () => {
  it("matches host funnel paths, with or without query", () => {
    expect(isHostFunnelPath("/become-a-host")).toBe(true)
    expect(isHostFunnelPath("/become-a-host?resume=1")).toBe(true)
    expect(isHostFunnelPath("/dashboard/host/new")).toBe(true)
  })

  it("ignores everything else", () => {
    expect(isHostFunnelPath(null)).toBe(false)
    expect(isHostFunnelPath("/")).toBe(false)
    expect(isHostFunnelPath("/explore")).toBe(false)
    expect(isHostFunnelPath("/become-a-hostess")).toBe(false)
    expect(isHostFunnelPath("/dashboard/hosting")).toBe(false)
  })
})

describe("hostSignupHref", () => {
  it("presets host intent and returns to the rules step", () => {
    const url = new URL(hostSignupHref(), "https://usethrml.com")
    expect(url.pathname).toBe("/signup")
    expect(url.searchParams.get("intent")).toBe("host")
    expect(url.searchParams.get("next")).toBe("/become-a-host?resume=1")
  })
})

describe("pickNoListingNudge", () => {
  const none = new Set<string>()

  it("sends nothing before day 3", () => {
    expect(pickNoListingNudge(0, none)).toBeNull()
    expect(pickNoListingNudge(2, none)).toBeNull()
  })

  it("steps through the three nudges", () => {
    expect(pickNoListingNudge(3, none)).toBe("host_no_listing_nudge_1")
    expect(pickNoListingNudge(7, new Set(["host_no_listing_nudge_1"]))).toBe("host_no_listing_nudge_2")
    expect(
      pickNoListingNudge(14, new Set(["host_no_listing_nudge_1", "host_no_listing_nudge_2"]))
    ).toBe("host_no_listing_nudge_3")
  })

  it("skips stale stages instead of sending a backlog", () => {
    expect(pickNoListingNudge(15, none)).toBe("host_no_listing_nudge_3")
  })

  it("does not repeat a sent nudge", () => {
    expect(pickNoListingNudge(5, new Set(["host_no_listing_nudge_1"]))).toBeNull()
  })
})

describe("guestBookingsOpen", () => {
  const original = process.env.GUEST_BOOKINGS_OPEN
  afterEach(() => {
    process.env.GUEST_BOOKINGS_OPEN = original
  })

  it("defaults to closed", () => {
    delete process.env.GUEST_BOOKINGS_OPEN
    expect(guestBookingsOpen()).toBe(false)
  })

  it("opens only on an explicit true", () => {
    process.env.GUEST_BOOKINGS_OPEN = "true"
    expect(guestBookingsOpen()).toBe(true)
    process.env.GUEST_BOOKINGS_OPEN = "1"
    expect(guestBookingsOpen()).toBe(false)
  })
})

describe("hasCompletedHostOnboarding", () => {
  it("requires host terms for new hosts", () => {
    expect(hasCompletedHostOnboarding({ activeListingCount: 0, hostTermsAccepted: false })).toBe(false)
    expect(hasCompletedHostOnboarding({ activeListingCount: 0, hostTermsAccepted: null })).toBe(false)
    expect(hasCompletedHostOnboarding({ activeListingCount: 0, hostTermsAccepted: true })).toBe(true)
  })

  it("lets hosts with a live listing through", () => {
    expect(hasCompletedHostOnboarding({ activeListingCount: 1 })).toBe(true)
  })
})
