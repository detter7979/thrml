"use client"

import { useEffect } from "react"

import { trackGaEvent } from "@/lib/analytics/ga"

type BookingConfirmationTrackerProps = {
  bookingId: string
  listingId: string
  totalAmount: number
  serviceType: string | null
  city: string | null
}

export function BookingConfirmationTracker({
  bookingId,
  listingId,
  totalAmount,
  serviceType,
  city,
}: BookingConfirmationTrackerProps) {
  useEffect(() => {
    trackGaEvent("purchase", {
      transaction_id: bookingId,
      listing_id: listingId,
      value: totalAmount,
      currency: "USD",
      service_type: serviceType,
      city,
    })
  }, [bookingId, city, listingId, serviceType, totalAmount])

  return null
}
