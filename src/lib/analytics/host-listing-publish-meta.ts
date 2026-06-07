import { getGa4ClientIdForMp } from "@/lib/analytics/ga-client-id"
import { trackGaEvent } from "@/lib/analytics/ga"
import { getFacebookPixelCookies, trackMetaEvent } from "@/components/meta-pixel"
import {
  META_EVENT_HOST_FIRST_LISTING_CREATED,
  META_EVENT_HOST_LISTING_CREATED,
} from "@/lib/meta-capi"

export type HostListingPublishedMetaOptions = {
  listingId: string
  userId: string
  hostListingCreatedEventId?: string
  hostFirstListingCreatedEventId?: string
  isFirstListing?: boolean
  /** When false, skip server CAPI (POST /api/listings already sent it). */
  sendServer?: boolean
}

/** Browser Pixel + optional server CAPI when a host publishes a listing. */
export function trackHostListingPublishedMeta({
  listingId,
  userId,
  hostListingCreatedEventId,
  hostFirstListingCreatedEventId,
  isFirstListing = false,
  sendServer = true,
}: HostListingPublishedMetaOptions): { eventId: string } {
  const listingEventId = hostListingCreatedEventId ?? crypto.randomUUID()
  const firstListingEventId = hostFirstListingCreatedEventId ?? crypto.randomUUID()
  const listingPixelCookies = getFacebookPixelCookies()
  const listingGaClientId = getGa4ClientIdForMp(userId)

  trackMetaEvent(
    META_EVENT_HOST_LISTING_CREATED,
    {
      content_name: "New Listing",
      content_type: "product",
      content_id: listingId,
      event_id: listingEventId,
    },
    { eventId: listingEventId, sendServer: false, custom: true }
  )

  if (isFirstListing) {
    trackMetaEvent(
      META_EVENT_HOST_FIRST_LISTING_CREATED,
      {
        content_name: "First Host Listing",
        content_type: "product",
        content_id: listingId,
        event_id: firstListingEventId,
      },
      { eventId: firstListingEventId, sendServer: false, custom: true }
    )
  }

  if (sendServer) {
    void fetch("/api/events/listing-created", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        event_id: listingEventId,
        first_listing_event_id: isFirstListing ? firstListingEventId : undefined,
        listing_id: listingId,
        client_id: listingGaClientId,
        is_first_listing: isFirstListing,
        event_source_url: typeof window !== "undefined" ? window.location.href : undefined,
        ...listingPixelCookies,
      }),
    }).catch(() => undefined)
  }

  trackGaEvent(META_EVENT_HOST_LISTING_CREATED, {
    event_category: "host_funnel",
    event_label: "listing_published",
    listing_id: listingId,
  })

  if (isFirstListing) {
    trackGaEvent(META_EVENT_HOST_FIRST_LISTING_CREATED, {
      event_category: "host_funnel",
      event_label: "first_listing_published",
      listing_id: listingId,
    })
  }

  return { eventId: listingEventId }
}
