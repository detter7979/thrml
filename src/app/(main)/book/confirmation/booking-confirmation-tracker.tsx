"use client"

import { useEffect } from "react"

import { trackMetaEvent } from "@/components/meta-pixel"
import { trackGaEvent } from "@/lib/analytics/ga"
import { isAnalyticsConsented } from "@/lib/cookie-consent"

type BookingConfirmationTrackerProps = {
  bookingId: string
  listingId: string
  totalAmount: number
  serviceType: string | null
  city: string | null
  userEmail?: string | null
  userFirstName?: string | null
  userLastName?: string | null
}

export function BookingConfirmationTracker({
  bookingId,
  listingId,
  totalAmount,
  serviceType,
  city,
  userEmail,
  userFirstName,
  userLastName,
}: BookingConfirmationTrackerProps) {
  useEffect(() => {
    if (!isAnalyticsConsented()) return

    const purchaseEventId = `purchase_${bookingId}`

    // GA4 purchase (client-side — deduplicates against server-side MP event).
    trackGaEvent("purchase", {
      event_id: purchaseEventId,
      transaction_id: bookingId,
      listing_id: listingId,
      value: totalAmount,
      currency: "USD",
      service_type: serviceType,
      city,
    })

    // Meta Pixel purchase.
    trackMetaEvent("Purchase", {
      content_ids: [listingId],
      content_type: "product",
      value: totalAmount,
      currency: "USD",
    }, {
      eventId: purchaseEventId,
      userData: {
        ...(userEmail ? { email: userEmail } : {}),
        ...(userFirstName ? { firstName: userFirstName } : {}),
        ...(userLastName ? { lastName: userLastName } : {}),
      },
    })

    // Google Ads counts purchases through the GA4 "purchase" import (Goals → Conversions), so
    // no separate Ads conversion is sent here — that would count each booking twice.
  }, [bookingId, city, listingId, serviceType, totalAmount, userEmail, userFirstName, userLastName])

  return null
}
