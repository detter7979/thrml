import { describe, expect, it } from "vitest"

import { includeInBiweeklyDispatch } from "@/lib/newsletter/biweekly-audience"

describe("biweekly audience", () => {
  it("holds the launch list until bookings open", () => {
    expect(includeInBiweeklyDispatch({ launchNotify: true, preLaunch: true })).toBe(false)
    expect(includeInBiweeklyDispatch({ launchNotify: true, preLaunch: false })).toBe(true)
    expect(includeInBiweeklyDispatch({ launchNotify: false, preLaunch: true })).toBe(true)
  })
})
