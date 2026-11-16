import { describe, expect, it } from "vitest"

import { buildListingGtagCalls } from "@/lib/analytics/listing-events"
import type { FeedListing } from "@/lib/feeds/get-listings-for-feed"
import {
  buildCustomFeedItem,
  clipText,
  diffCustomFeed,
  toDynamicCustomAsset,
  updateMaskFor,
  type ExistingFeedAsset,
} from "@/lib/feeds/google-custom-feed"
import { googleFeedItemId } from "@/lib/feeds/google-feed-id"

const UUID = "3f2a9c1e-7b4d-4e8a-9f10-2c6b8d4e1a77"

function listing(overrides: Partial<FeedListing> = {}): FeedListing {
  return {
    id: UUID,
    title: "Cedar barrel sauna in Ballard",
    description: "",
    service_type: "sauna",
    price: 45,
    session_type: "hourly",
    location_address: "Seattle, WA",
    location_city: "Seattle",
    location_state: "WA",
    lat: 47.66,
    lng: -122.38,
    url: `https://usethrml.com/listings/${UUID}`,
    image_url: "https://cdn.example.com/a.jpg",
    availability: "in stock",
    ...overrides,
  }
}

describe("googleFeedItemId", () => {
  it("strips hyphens so the ID is letters and digits only", () => {
    expect(googleFeedItemId(UUID)).toBe("3f2a9c1e7b4d4e8a9f102c6b8d4e1a77")
  })
})

describe("buildCustomFeedItem", () => {
  it("maps a listing to a city-level custom feed item", () => {
    expect(buildCustomFeedItem(listing())).toEqual({
      id: "3f2a9c1e7b4d4e8a9f102c6b8d4e1a77",
      itemTitle: "Cedar barrel sauna",
      itemSubtitle: "Seattle, WA",
      itemDescription: "Private sauna by the hour",
      itemAddress: "Seattle, WA, USA",
      itemCategory: "Sauna",
      price: "45.00 USD",
      formattedPrice: "$45/hour",
      imageUrl: "https://cdn.example.com/a.jpg",
      finalUrl: `https://usethrml.com/listings/${UUID}`,
    })
  })

  it("labels fixed sessions and leaves out a missing price", () => {
    const item = buildCustomFeedItem(listing({ session_type: "fixed_session", price: 0 }))
    expect(item?.itemDescription).toBe("Private sauna session")
    expect(item?.price).toBe("")
    expect(item?.formattedPrice).toBe("")
  })

  it("skips listings without a photo (dynamic ads need an image)", () => {
    expect(buildCustomFeedItem(listing({ image_url: null }))).toBeNull()
  })
})

describe("clipText", () => {
  it("cuts at a word boundary within 25 characters", () => {
    expect(clipText("Wood-fired lakeside sauna with cold plunge")).toBe("Wood-fired lakeside sauna")
    expect(clipText("Short title")).toBe("Short title")
  })
})

describe("diffCustomFeed", () => {
  const base = buildCustomFeedItem(listing())!
  const existing = (item = base, n = 1): ExistingFeedAsset => ({
    assetSetAssetResourceName: `customers/1/assetSetAssets/9~${n}`,
    assetResourceName: `customers/1/assets/${n}`,
    item,
  })

  it("creates new, updates changed, removes gone and dedupes", () => {
    const other = buildCustomFeedItem(listing({ id: "aaaaaaaa-0000-0000-0000-000000000001" }))!
    const changed = { ...base, formattedPrice: "$50/hour", price: "50.00 USD" }
    const stale = { ...base, id: "deadbeef" }
    const diff = diffCustomFeed([changed, other], [existing(base, 1), existing(base, 2), existing(stale, 3)])
    expect(diff.create.map((i) => i.id)).toEqual([other.id])
    expect(diff.update).toHaveLength(1)
    expect(diff.update[0].changed).toEqual(["price", "formattedPrice"])
    expect(diff.remove.map((r) => r.assetResourceName).sort()).toEqual(["customers/1/assets/2", "customers/1/assets/3"])
    expect(diff.unchanged).toBe(0)
  })

  it("leaves identical items alone", () => {
    const diff = diffCustomFeed([base], [existing()])
    expect(diff).toMatchObject({ create: [], update: [], remove: [], unchanged: 1 })
  })
})

describe("REST helpers", () => {
  it("builds update masks and omits empty fields", () => {
    expect(updateMaskFor(["price", "finalUrl"])).toBe("dynamicCustomAsset.price,finalUrls")
    const body = toDynamicCustomAsset({ ...buildCustomFeedItem(listing())!, price: "" }, { includeId: false })
    expect(body.id).toBeUndefined()
    expect(body.price).toBeUndefined()
    expect(body.itemTitle).toBe("Cedar barrel sauna")
  })
})

describe("buildListingGtagCalls", () => {
  it("sends titles only to GA4 and only the feed ID to Google Ads", () => {
    const calls = buildListingGtagCalls(
      "view_item",
      { listingId: UUID, value: 45, gaParams: { item_name: "Cedar barrel sauna", item_category: "sauna" } },
      { gaId: "G-TEST", adsId: "AW-123" }
    )
    expect(calls).toEqual([
      ["event", "view_item", { item_name: "Cedar barrel sauna", item_category: "sauna", send_to: "G-TEST" }],
      [
        "event",
        "view_item",
        {
          send_to: "AW-123",
          value: 45,
          currency: "USD",
          items: [{ id: "3f2a9c1e7b4d4e8a9f102c6b8d4e1a77", google_business_vertical: "custom" }],
        },
      ],
    ])
    expect(JSON.stringify(calls[1])).not.toMatch(/Cedar|sauna/)
  })
})
