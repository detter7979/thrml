import { describe, expect, it } from "vitest"

import { guestLaunchLabel, isGuestPreLaunch } from "@/lib/launch-config"
import { parseSubscribeExtras } from "@/lib/newsletter/subscribe-input"

describe("parseSubscribeExtras", () => {
  it("defaults to the plain homepage newsletter", () => {
    expect(parseSubscribeExtras({})).toEqual({
      source: "homepage",
      launchNotify: false,
      signupPath: null,
      utmSource: null,
      utmCampaign: null,
    })
  })

  it("treats launch sources as launch-list signups", () => {
    expect(parseSubscribeExtras({ source: "guest_lp" }).launchNotify).toBe(true)
    expect(parseSubscribeExtras({ source: "launch_waitlist" }).launchNotify).toBe(true)
    expect(parseSubscribeExtras({ source: "homepage", launch_notify: true }).launchNotify).toBe(true)
  })

  it("falls back on unknown sources and cleans tracking fields", () => {
    const parsed = parseSubscribeExtras({
      source: "evil",
      signup_path: "/go/saunas/seattle",
      utm_source: "facebook<script>",
      utm_campaign: "C012_META_guest_all_SEA_P1_PROSP_VC",
    })
    expect(parsed.source).toBe("homepage")
    expect(parsed.signupPath).toBe("/go/saunas/seattle")
    expect(parsed.utmSource).toBe("facebookscript")
    expect(parsed.utmCampaign).toBe("C012_META_guest_all_SEA_P1_PROSP_VC")
  })

  it("rejects signup paths that are not site paths", () => {
    expect(parseSubscribeExtras({ signup_path: "https://evil.example" }).signupPath).toBeNull()
  })
})

describe("guest launch date", () => {
  it("is pre-launch until midnight Pacific on launch day", () => {
    expect(isGuestPreLaunch(new Date("2026-12-14T07:59:00Z"), "2026-12-14")).toBe(true)
    expect(isGuestPreLaunch(new Date("2026-12-14T08:00:00Z"), "2026-12-14")).toBe(false)
  })

  it("formats the launch day for copy", () => {
    expect(guestLaunchLabel("2026-12-14")).toBe("December 14")
  })
})
