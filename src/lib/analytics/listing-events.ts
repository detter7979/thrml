"use client"

import { gtagIfConsented } from "@/lib/analytics/gtag"
import { normalizeGaMeasurementId, normalizeGoogleAdsId } from "@/lib/analytics/env-ids"
import { googleFeedItemId } from "@/lib/feeds/google-feed-id"

export type ListingGoogleEvent = "view_item" | "begin_checkout" | "purchase"

/**
 * Builds the gtag calls for a listing event, split by destination:
 *  - GA4 gets the full analytics params (title, city, …) for site reporting.
 *  - Google Ads gets only the listing's feed ID, value and currency — enough for dynamic
 *    remarketing to match the visit to the custom feed, without the listing title or service type
 *    (the health-data policy promises we don't share those with ad platforms).
 * Without send_to, gtag would send the GA params to every configured tag, Google Ads included.
 */
export function buildListingGtagCalls(
  event: ListingGoogleEvent,
  args: { listingId: string; value: number; gaParams: Record<string, unknown> },
  ids: { gaId: string | null; adsId: string | null }
): Array<[string, string, Record<string, unknown>]> {
  const calls: Array<[string, string, Record<string, unknown>]> = []
  if (ids.gaId) {
    calls.push(["event", event, { ...args.gaParams, send_to: ids.gaId }])
  }
  if (ids.adsId) {
    calls.push([
      "event",
      event,
      {
        send_to: ids.adsId,
        value: args.value,
        currency: "USD",
        items: [{ id: googleFeedItemId(args.listingId), google_business_vertical: "custom" }],
      },
    ])
  }
  return calls
}

export function trackGoogleListingEvent(
  event: ListingGoogleEvent,
  args: { listingId: string; value: number; gaParams: Record<string, unknown> }
) {
  if (process.env.NODE_ENV !== "production") return
  const calls = buildListingGtagCalls(event, args, {
    gaId: normalizeGaMeasurementId(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID),
    adsId: normalizeGoogleAdsId(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID),
  })
  for (const call of calls) gtagIfConsented(...call)
}
