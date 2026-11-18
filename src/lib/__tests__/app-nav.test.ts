import { describe, expect, it } from "vitest"

import { activityTab, isAppTabActive, postSignupPath, showAppTabBar } from "@/lib/app-nav"

describe("postSignupPath", () => {
  it("sends guests and both to explore, and hosts into listing", () => {
    expect(postSignupPath("guest", null)).toBe("/explore")
    expect(postSignupPath("both", null)).toBe("/explore")
    expect(postSignupPath("host", null)).toBe("/become-a-host")
  })

  it("keeps a path the person was already on", () => {
    expect(postSignupPath("guest", "/book/abc")).toBe("/book/abc")
  })
})

describe("app tab bar", () => {
  it("hides during checkout", () => {
    expect(showAppTabBar("/book/abc")).toBe(false)
    expect(showAppTabBar("/listing/abc")).toBe(false)
    expect(showAppTabBar("/explore")).toBe(true)
  })

  it("points the activity tab at listings for hosts and bookings for guests", () => {
    expect(activityTab(true)).toEqual({ href: "/dashboard/listings", label: "Listings" })
    expect(activityTab(false)).toEqual({ href: "/dashboard/bookings", label: "Bookings" })
  })

  it("lights one tab for the screen you are on", () => {
    expect(isAppTabActive("/listing/1", "explore")).toBe(true)
    expect(isAppTabActive("/dashboard/messages", "inbox")).toBe(true)
    expect(isAppTabActive("/dashboard/messages/abc", "inbox")).toBe(true)
    expect(isAppTabActive("/dashboard/listings/new", "activity")).toBe(true)
    expect(isAppTabActive("/dashboard/saved", "wishlists")).toBe(true)
    expect(isAppTabActive("/dashboard/account", "profile")).toBe(true)
    expect(isAppTabActive("/dashboard/earnings", "profile")).toBe(true)
    expect(isAppTabActive("/dashboard/host/templates", "profile")).toBe(true)
    expect(isAppTabActive("/dashboard/host/templates", "activity")).toBe(false)
    expect(isAppTabActive("/dashboard/bookings", "inbox")).toBe(false)
    expect(isAppTabActive("/dashboard", "profile")).toBe(false)
  })
})
