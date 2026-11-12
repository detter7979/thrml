import { afterEach, describe, expect, it } from "vitest"

import {
  draftProgressPercent,
  guestBookingsOpen,
  hostSetupSteps,
  hostSpaceTypesSentence,
  pickDraftReminder,
  pickIdentityStartReminder,
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

describe("draftProgressPercent", () => {
  it("counts completed steps", () => {
    expect(draftProgressPercent(1, 5)).toBe(0)
    expect(draftProgressPercent(3, 5)).toBe(40)
    expect(draftProgressPercent(5, 5)).toBe(80)
  })

  it("handles the saunas-only wizard that starts at step 2", () => {
    expect(draftProgressPercent(2, 5, 2)).toBe(0)
    expect(draftProgressPercent(4, 5, 2)).toBe(50)
  })

  it("clamps out-of-range steps", () => {
    expect(draftProgressPercent(0, 5)).toBe(0)
    expect(draftProgressPercent(9, 5)).toBe(100)
  })
})

describe("pickDraftReminder / pickIdentityStartReminder", () => {
  it("sends draft reminders at day 1 and 4", () => {
    expect(pickDraftReminder(0, new Set())).toBeNull()
    expect(pickDraftReminder(1, new Set())).toBe("host_draft_reminder_1")
    expect(pickDraftReminder(4, new Set(["host_draft_reminder_1"]))).toBe("host_draft_reminder_2")
    expect(pickDraftReminder(5, new Set(["host_draft_reminder_2"]))).toBeNull()
  })

  it("sends identity reminders at day 2 and 7", () => {
    expect(pickIdentityStartReminder(1, new Set())).toBeNull()
    expect(pickIdentityStartReminder(2, new Set())).toBe("host_identity_start_reminder_1")
    expect(pickIdentityStartReminder(8, new Set())).toBe("host_identity_start_reminder_2")
  })
})

describe("hostSetupSteps", () => {
  const base = {
    hostTermsAccepted: false,
    hasLiveListing: false,
    draftPercent: null,
    idVerified: false,
    payoutsEnabled: false,
  }

  it("starts at 0 of 4", () => {
    const { completed, total, steps } = hostSetupSteps(base)
    expect(completed).toBe(0)
    expect(total).toBe(4)
    expect(steps.map((s) => s.id)).toEqual(["agreement", "listing", "identity", "payouts"])
  })

  it("shows draft progress on the listing step", () => {
    const listing = hostSetupSteps({ ...base, hostTermsAccepted: true, draftPercent: 60 }).steps[1]
    expect(listing?.detail).toContain("60%")
    expect(listing?.cta).toBe("Continue")
  })

  it("treats a live listing as an accepted agreement (older hosts)", () => {
    const { completed } = hostSetupSteps({ ...base, hasLiveListing: true, payoutsEnabled: true })
    expect(completed).toBe(3)
  })
})

describe("hostSpaceTypesSentence", () => {
  it("doesn't promise other space types during the saunas-only launch", () => {
    expect(hostSpaceTypesSentence(true)).toContain("coming soon")
    expect(hostSpaceTypesSentence(false)).toContain("all welcome")
  })
})
