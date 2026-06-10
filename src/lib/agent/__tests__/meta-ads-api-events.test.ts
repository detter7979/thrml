import { describe, it, expect } from "vitest"

import { mapMetaActionsToEvents } from "../meta-ads-api"

describe("mapMetaActionsToEvents host listing events", () => {
  it("maps host_first_listing_created to NL", () => {
    const out = mapMetaActionsToEvents([
      { action_type: "offsite_conversion.fb_pixel_custom.host_first_listing_created", value: "2" },
    ])
    expect(out).toEqual([{ event_t: "NL", conversions: 2 }])
  })

  it("maps host_listing_created to HLC", () => {
    const out = mapMetaActionsToEvents([
      { action_type: "host_listing_created", value: "5" },
    ])
    expect(out).toEqual([{ event_t: "HLC", conversions: 5 }])
  })

  it("still maps legacy listing_created to NL", () => {
    const out = mapMetaActionsToEvents([
      { action_type: "listing_created", value: "1" },
    ])
    expect(out).toEqual([{ event_t: "NL", conversions: 1 }])
  })
})
