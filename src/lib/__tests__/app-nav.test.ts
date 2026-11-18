import { describe, expect, it } from "vitest"

import {
  isAppTabActive,
  modeForIntent,
  onboardingDestination,
  onboardingMode,
  postSignupPath,
  showAppTabBar,
  tabsForMode,
} from "@/lib/app-nav"

describe("postSignupPath", () => {
  it("sends guests to explore, both to explore with the host prompt, and hosts into listing", () => {
    expect(postSignupPath("guest", null)).toBe("/explore")
    expect(postSignupPath("both", null)).toBe("/explore?intent=both")
    expect(postSignupPath("host", null)).toBe("/become-a-host")
  })

  it("keeps a path the person was already on", () => {
    expect(postSignupPath("guest", "/book/abc")).toBe("/book/abc")
  })
})

describe("modeForIntent", () => {
  it("opens hosting only for people who came to list", () => {
    expect(modeForIntent("host")).toBe("hosting")
    expect(modeForIntent("guest")).toBe("booking")
    expect(modeForIntent("both")).toBe("booking")
  })
})

describe("app tab bar", () => {
  it("hides during checkout and account creation", () => {
    expect(showAppTabBar("/book/abc")).toBe(false)
    expect(showAppTabBar("/listing/abc")).toBe(false)
    expect(showAppTabBar("/signup")).toBe(false)
    expect(showAppTabBar("/explore")).toBe(true)
  })

  it("gives booking and hosting their own tabs", () => {
    expect(tabsForMode("booking").map((tab) => tab.label)).toEqual([
      "Explore",
      "Wishlists",
      "Bookings",
      "Inbox",
      "Profile",
    ])
    expect(tabsForMode("hosting").map((tab) => tab.label)).toEqual([
      "Today",
      "Listings",
      "Bookings",
      "Inbox",
      "Profile",
    ])
  })

  it("lights one tab for the screen you are on", () => {
    expect(isAppTabActive("/listing/1", "explore")).toBe(true)
    expect(isAppTabActive("/dashboard/messages", "inbox")).toBe(true)
    expect(isAppTabActive("/dashboard/messages/abc", "inbox")).toBe(true)
    expect(isAppTabActive("/dashboard/listings/new", "listings")).toBe(true)
    expect(isAppTabActive("/dashboard/saved", "wishlists")).toBe(true)
    expect(isAppTabActive("/dashboard/bookings", "bookings")).toBe(true)
    expect(isAppTabActive("/dashboard", "today")).toBe(true)
    expect(isAppTabActive("/dashboard/account", "profile")).toBe(true)
    expect(isAppTabActive("/dashboard/earnings", "profile")).toBe(true)
    expect(isAppTabActive("/dashboard/host/templates", "profile")).toBe(true)
    expect(isAppTabActive("/dashboard/host/templates", "listings")).toBe(false)
    expect(isAppTabActive("/dashboard/bookings", "inbox")).toBe(false)
    expect(isAppTabActive("/dashboard", "profile")).toBe(false)
    expect(isAppTabActive("/dashboard/listings", "today")).toBe(false)
  })
})

describe("onboarding exits", () => {
  it("routes each choice and shortcut without requiring an account", () => {
    expect(onboardingDestination("guest")).toBe("/explore")
    expect(onboardingDestination("both")).toBe("/explore?intent=both")
    expect(onboardingDestination("host")).toBe("/become-a-host")
    expect(onboardingDestination("look_around")).toBe("/explore")
    expect(onboardingDestination("shortcut_explore")).toBe("/explore")
    expect(onboardingDestination("shortcut_host")).toBe("/become-a-host")
  })

  it("opens hosting mode only for host exits", () => {
    expect(onboardingMode("host")).toBe("hosting")
    expect(onboardingMode("shortcut_host")).toBe("hosting")
    expect(onboardingMode("both")).toBe("booking")
    expect(onboardingMode("look_around")).toBe("booking")
  })
})
