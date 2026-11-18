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
