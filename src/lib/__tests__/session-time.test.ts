import { describe, expect, it } from "vitest"

import {
  isDueBeforeNextRun,
  marketDateString,
  nextRemindersRunAt,
  sessionInstant,
} from "@/lib/session-time"

describe("sessionInstant", () => {
  it("reads stored times as Seattle time in winter (PST, UTC-8)", () => {
    expect(sessionInstant("2026-12-04", "10:00:00")?.toISOString()).toBe("2026-12-04T18:00:00.000Z")
  })

  it("reads stored times as Seattle time in summer (PDT, UTC-7)", () => {
    expect(sessionInstant("2026-07-04", "10:00")?.toISOString()).toBe("2026-07-04T17:00:00.000Z")
  })

  it("handles the day the clocks change", () => {
    expect(sessionInstant("2026-03-08", "12:00")?.toISOString()).toBe("2026-03-08T19:00:00.000Z")
    expect(sessionInstant("2026-11-01", "12:00")?.toISOString()).toBe("2026-11-01T20:00:00.000Z")
  })

  it("defaults a missing time to midnight and rejects bad input", () => {
    expect(sessionInstant("2026-12-04", null)?.toISOString()).toBe("2026-12-04T08:00:00.000Z")
    expect(sessionInstant(null, "10:00")).toBeNull()
    expect(sessionInstant("12/04/2026", "10:00")).toBeNull()
  })
})

describe("marketDateString", () => {
  it("uses the Seattle calendar date, not UTC", () => {
    // 2026-12-05 03:00 UTC is still Dec 4 in Seattle
    expect(marketDateString(new Date("2026-12-05T03:00:00Z"))).toBe("2026-12-04")
  })
})

describe("isDueBeforeNextRun", () => {
  const startsAt = sessionInstant("2026-12-10", "10:00:00")! // Thu 10 AM PST

  it("sends 'day before' items in the run before the send moment", () => {
    const tuesdayRun = new Date("2026-12-08T08:00:00Z")
    const wednesdayRun = new Date("2026-12-09T08:00:00Z")
    expect(isDueBeforeNextRun({ startsAt, hoursBefore: 24, now: tuesdayRun })).toBe(false)
    expect(isDueBeforeNextRun({ startsAt, hoursBefore: 24, now: wednesdayRun })).toBe(true)
  })

  it("sends 'morning of' items in the run on the session day", () => {
    const wednesdayRun = new Date("2026-12-09T08:00:00Z")
    const thursdayRun = new Date("2026-12-10T08:00:00Z")
    expect(isDueBeforeNextRun({ startsAt, hoursBefore: 1, now: wednesdayRun })).toBe(false)
    expect(isDueBeforeNextRun({ startsAt, hoursBefore: 1, now: thursdayRun })).toBe(true)
  })

  it("never sends once the session has started", () => {
    expect(isDueBeforeNextRun({ startsAt, hoursBefore: 1, now: new Date("2026-12-10T19:00:00Z") })).toBe(false)
  })

  it("sends right away when a same-day booking lands after the morning run", () => {
    const bookedAt = new Date("2026-12-10T16:00:00Z") // Thu 8 AM PST, session at 10
    expect(
      isDueBeforeNextRun({ startsAt, hoursBefore: 1, now: bookedAt, nextRunAt: nextRemindersRunAt(bookedAt) })
    ).toBe(true)
  })
})

describe("nextRemindersRunAt", () => {
  it("returns today's run if it hasn't happened, otherwise tomorrow's", () => {
    expect(nextRemindersRunAt(new Date("2026-12-09T07:00:00Z")).toISOString()).toBe("2026-12-09T08:00:00.000Z")
    expect(nextRemindersRunAt(new Date("2026-12-09T08:00:00Z")).toISOString()).toBe("2026-12-10T08:00:00.000Z")
  })
})
