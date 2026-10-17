import { describe, it, expect } from "vitest"

import { customConversionEvent, mapMetaActionsToEvents } from "../meta-ads-api"

describe("mapMetaActionsToEvents host listing events", () => {
  it("maps host_first_listing_created to NL", () => {
    const out = mapMetaActionsToEvents([
      { action_type: "offsite_conversion.fb_pixel_custom.host_first_listing_created", value: "2" },
    ])
    expect(out).toEqual([{ event_t: "NL", conversions: 2 }])
  })

  it("ignores host_listing_created (not an event_t; NL covers first listings)", () => {
    const out = mapMetaActionsToEvents([
      { action_type: "host_listing_created", value: "5" },
    ])
    expect(out).toEqual([])
  })

  it("maps custom conversions by id using the account's conversion names", () => {
    const cc = new Map([["2373150366492992", "BH"], ["111", "HO"]])
    const out = mapMetaActionsToEvents(
      [
        { action_type: "offsite_conversion.custom.2373150366492992", value: "7" },
        { action_type: "offsite_conversion.custom.111", value: "2" },
        { action_type: "offsite_conversion.custom.999", value: "4" },
        { action_type: "offsite_conversion.fb_pixel_custom", value: "40" },
      ],
      cc
    )
    expect(out).toEqual([
      { event_t: "BH", conversions: 7 },
      { event_t: "HO", conversions: 2 },
    ])
  })

  it("reads the event from custom conversion names", () => {
    expect(customConversionEvent("BH_become_host_click")).toBe("BH")
    expect(customConversionEvent("NL_host_first_listing_created")).toBe("NL")
    expect(customConversionEvent("become_host", "{\"event\":\"become_host_click\"}")).toBe("BH")
    expect(customConversionEvent("view_listings")).toBeNull()
  })

  it("still maps legacy listing_created to NL", () => {
    const out = mapMetaActionsToEvents([
      { action_type: "listing_created", value: "1" },
    ])
    expect(out).toEqual([{ event_t: "NL", conversions: 1 }])
  })
})
