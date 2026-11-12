import { describe, expect, it } from "vitest"

import {
  areaKey,
  calendarOpenForWeeks,
  enabledWeekdays,
  evaluateLaunchReadiness,
  type ReadinessHost,
  type ReadinessListing,
} from "../readiness"

// Thursday 2026-11-12
const now = new Date("2026-11-12T18:00:00Z")
const weekdaysOnly = ["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => ({
  day,
  start: "08:00",
  end: "20:00",
  enabled: true,
}))

describe("enabledWeekdays", () => {
  it("reads enabled days and skips disabled or empty ranges", () => {
    const days = enabledWeekdays([
      { day: "Mon", start: "08:00", end: "20:00", enabled: true },
      { day: "Tue", start: "08:00", end: "20:00", enabled: false },
      { day: "Wed", start: "20:00", end: "08:00", enabled: true },
    ])
    expect([...days]).toEqual([1])
    expect(enabledWeekdays(null).size).toBe(0)
  })
})

describe("calendarOpenForWeeks", () => {
  it("is open with a weekday schedule", () => {
    expect(calendarOpenForWeeks({ availability: weekdaysOnly, blackoutDates: [], now, weeks: 2 })).toBe(true)
  })

  it("is closed when the second week is blacked out", () => {
    const blackouts = ["2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25"]
    expect(calendarOpenForWeeks({ availability: weekdaysOnly, blackoutDates: blackouts, now, weeks: 2 })).toBe(false)
  })

  it("is closed with no schedule", () => {
    expect(calendarOpenForWeeks({ availability: [], blackoutDates: [], now, weeks: 2 })).toBe(false)
  })
})

describe("areaKey", () => {
  it("groups nearby points and separates distant ones", () => {
    expect(areaKey(47.701, -122.341)).toBe(areaKey(47.705, -122.35))
    expect(areaKey(47.701, -122.341)).not.toBe(areaKey(47.61, -122.33))
    expect(areaKey(null, -122.3)).toBeNull()
  })
})

describe("evaluateLaunchReadiness", () => {
  const host = (id: string, complete = true): ReadinessHost => ({
    id,
    name: id,
    idVerified: complete,
    payoutsEnabled: complete,
  })
  const listing = (id: string, lat: number, overrides: Partial<ReadinessListing> = {}): ReadinessListing => ({
    id,
    title: id,
    hostId: `h-${id}`,
    serviceType: "sauna",
    isActive: true,
    lat,
    lng: -122.33,
    photoCount: 3,
    availability: weekdaysOnly,
    blackoutDates: [],
    ...overrides,
  })

  it("counts only listings that pass every check", () => {
    const listings = [
      listing("a", 47.6),
      listing("b", 47.7, { photoCount: 2 }),
      listing("c", 47.55, { isActive: false }),
    ]
    const hosts = [host("h-a"), host("h-b"), host("h-c")]
    const report = evaluateLaunchReadiness({ listings, hosts, now, saunasOnly: true })
    expect(report.liveCount).toBe(2)
    expect(report.readyCount).toBe(1)
    expect(report.readyToLaunch).toBe(false)
  })

  it("is ready with 12 good listings across 3 areas while saunas-only", () => {
    const lats = [47.52, 47.6, 47.7]
    const listings = Array.from({ length: 12 }, (_, i) => listing(`l${i}`, lats[i % 3] ?? 47.6))
    const hosts = listings.map((l) => host(l.hostId))
    const report = evaluateLaunchReadiness({ listings, hosts, now, saunasOnly: true })
    expect(report.readyCount).toBe(12)
    expect(report.areaCount).toBe(3)
    expect(report.readyToLaunch).toBe(true)
  })

  it("requires 2 space types once more types open", () => {
    const lats = [47.52, 47.6, 47.7]
    const listings = Array.from({ length: 12 }, (_, i) => listing(`l${i}`, lats[i % 3] ?? 47.6))
    const hosts = listings.map((l) => host(l.hostId))
    expect(evaluateLaunchReadiness({ listings, hosts, now, saunasOnly: false }).readyToLaunch).toBe(false)
  })

  it("excludes listings whose host hasn't finished setup", () => {
    const report = evaluateLaunchReadiness({
      listings: [listing("a", 47.6)],
      hosts: [host("h-a", false)],
      now,
      saunasOnly: true,
    })
    expect(report.readyCount).toBe(0)
    expect(report.checks[0]?.hostVerified).toBe(false)
  })
})
