import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { appPathFromUrl } from "@/lib/native/capacitor"
import { normalizeNotificationPreferences } from "@/lib/notification-preferences"
import { toAppPath } from "@/lib/push/send"

describe("in-app link handling", () => {
  it("keeps usethrml.com links inside the app and ignores other sites", () => {
    expect(appPathFromUrl("https://usethrml.com/listings/abc?x=1#top")).toBe("/listings/abc?x=1#top")
    expect(appPathFromUrl("https://www.usethrml.com/dashboard")).toBe("/dashboard")
    expect(appPathFromUrl("/dashboard/messages/1")).toBe("/dashboard/messages/1")
    expect(appPathFromUrl("https://evil.example/usethrml.com")).toBeNull()
    expect(appPathFromUrl(undefined)).toBeNull()
  })

  it("turns email links into app paths for notification taps", () => {
    expect(toAppPath("https://usethrml.com/dashboard/bookings/123")).toBe("/dashboard/bookings/123")
    expect(toAppPath("/dashboard")).toBe("/dashboard")
    expect(toAppPath("https://stripe.com/x")).toBeUndefined()
  })
})

describe("notification preferences", () => {
  it("defaults new messages and phone notifications on, marketing off", () => {
    const prefs = normalizeNotificationPreferences({})
    expect(prefs.new_message).toBe(true)
    expect(prefs.push_enabled).toBe(true)
    expect(prefs.marketing_wellness_tips).toBe(false)
    expect(normalizeNotificationPreferences({ push_enabled: false, new_booking: false }).push_enabled).toBe(false)
  })
})

describe("sign-in return and outside links", () => {
  it("turns the app's sign-in return link into the site's callback path", async () => {
    const { nativeAuthReturnPath } = await import("@/lib/native/capacitor")
    expect(nativeAuthReturnPath("com.usethrml.app://auth/callback?code=abc&next=%2Fexplore")).toBe(
      "/auth/callback?code=abc&next=%2Fexplore"
    )
    expect(nativeAuthReturnPath("com.usethrml.app://other/path")).toBeNull()
    expect(nativeAuthReturnPath("https://usethrml.com/auth/callback?code=abc")).toBeNull()
    expect(nativeAuthReturnPath(undefined)).toBeNull()
  })

  it("treats only other http(s) sites as outside links", async () => {
    const { isExternalWebUrl } = await import("@/lib/native/capacitor")
    const origin = "https://usethrml.com"
    expect(isExternalWebUrl("https://instagram.com/usethrml", origin)).toBe(true)
    expect(isExternalWebUrl("https://maps.google.com/?q=Seattle", origin)).toBe(true)
    expect(isExternalWebUrl("https://usethrml.com/faq", origin)).toBe(false)
    expect(isExternalWebUrl("https://www.usethrml.com/faq", origin)).toBe(false)
    expect(isExternalWebUrl("/explore", origin)).toBe(false)
    expect(isExternalWebUrl("mailto:hello@usethrml.com", origin)).toBe(false)
    expect(isExternalWebUrl("tel:+12065550100", origin)).toBe(false)
    // A preview deployment serving the app from its own origin keeps its links in-app.
    expect(isExternalWebUrl("https://thrml-git-x.vercel.app/explore", "https://thrml-git-x.vercel.app")).toBe(false)
  })
})
