import { getGa4ClientIdForMp } from "@/lib/analytics/ga-client-id"
import { trackGaEvent } from "@/lib/analytics/ga"
import { getFacebookPixelCookies, trackMetaEvent } from "@/components/meta-pixel"

export const META_EVENT_LISTING_CREATED = "listing_created"

export type HostListingPublishedMetaOptions = {
  listingId: string
  userId: string
}

/** Browser pixel + server CAPI when a host publishes a listing (create wizard or edit publish). */
export function trackHostListingPublishedMeta({
  listingId,
  userId,
}: HostListingPublishedMetaOptions): { eventId: string } {
  const eventId = crypto.randomUUID()
  const listingPixelCookies = getFacebookPixelCookies()
  const listingGaClientId = getGa4ClientIdForMp(userId)

  trackMetaEvent(
    META_EVENT_LISTING_CREATED,
    {
      content_name: "New Listing",
      content_type: "product",
      content_id: listingId,
      event_id: eventId,
    },
    { eventId, sendServer: false, custom: true }
  )

  void fetch("/api/events/listing-created", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      event_id: eventId,
      listing_id: listingId,
      client_id: listingGaClientId,
      ...listingPixelCookies,
    }),
  }).catch(() => undefined)

  trackGaEvent(META_EVENT_LISTING_CREATED, {
    event_category: "host_funnel",
    event_label: "listing_published",
    listing_id: listingId,
  })

  return { eventId }
}
