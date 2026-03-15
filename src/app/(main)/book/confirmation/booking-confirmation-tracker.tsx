"use client"

import { useEffect } from "react"

import { trackMetaEvent } from "@/components/meta-pixel"
import { trackGaEvent } from "@/lib/analytics/ga"

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
    const purchaseEventId = `purchase_${bookingId}`
    const googleAdsIdRaw = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim()
    const googleAdsId = googleAdsIdRaw && /^AW-\d+$/.test(googleAdsIdRaw) ? googleAdsIdRaw : null

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

    // Google Ads Enhanced Conversions.
    if (
      googleAdsId &&
      typeof window !== "undefined" &&
      (window as { gtag?: (...args: unknown[]) => void }).gtag
    ) {
      ;(window as { gtag: (...args: unknown[]) => void }).gtag("event", "conversion", {
        send_to: googleAdsId,
        transaction_id: bookingId,
        value: totalAmount,
        currency: "USD",
        ...(userEmail || userFirstName
          ? {
              user_data: {
                ...(userEmail ? { email_address: userEmail } : {}),
                ...(userFirstName ? { first_name: userFirstName } : {}),
                ...(userLastName ? { last_name: userLastName } : {}),
              },
            }
          : {}),
      })
    }
  }, [bookingId, city, listingId, serviceType, totalAmount, userEmail, userFirstName, userLastName])

  return null
}
