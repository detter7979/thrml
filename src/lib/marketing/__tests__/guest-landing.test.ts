import { describe, expect, it } from "vitest"

import {
  GUEST_CATALOG_MIN,
  guestLandingMode,
  guestMarket,
  guestPlaceLabel,
  guestPriceLabel,
  isPhotographedGuestListing,
} from "@/lib/marketing/guest-landing"

describe("guest landing mode", () => {
  it("stays on the waitlist until a full photographed set exists", () => {
    expect(guestLandingMode(0)).toBe("waitlist")
    expect(guestLandingMode(GUEST_CATALOG_MIN - 1)).toBe("waitlist")
    expect(guestLandingMode(GUEST_CATALOG_MIN)).toBe("catalog")
  })

  it("counts a listing only when it has a photo and a price", () => {
    expect(isPhotographedGuestListing({ photoUrl: "/a.jpg", priceSolo: 40 })).toBe(true)
    expect(isPhotographedGuestListing({ photoUrl: null, priceSolo: 40 })).toBe(false)
    expect(isPhotographedGuestListing({ photoUrl: "/a.jpg", priceSolo: 0 })).toBe(false)
  })

  it("stamps Seattle signups with Washington", () => {
    expect(guestMarket("seattle", "Seattle")).toEqual({ city: "Seattle", state: "WA" })
    expect(guestMarket("portland", "Portland").state).toBeNull()
  })

  it("hides the placeholder location and formats price", () => {
    expect(
      guestPlaceLabel({ city: null, state: null, location: "Location available after booking" })
    ).toBeNull()
    expect(guestPlaceLabel({ city: "Ballard", state: "WA", location: "" })).toBe("Ballard, WA")
    expect(guestPriceLabel({ priceSolo: 42, bookingModel: "hourly" })).toBe("from $42 / person / hr")
    expect(guestPriceLabel({ priceSolo: 68, bookingModel: "fixed_session" })).toBe("$68 / session")
  })
})
