"use client"

import { trackMetaEvent } from "@/components/meta-pixel"
import { PricingTable } from "@/components/listings/PricingTable"
import { Button } from "@/components/ui/button"
import { trackGaEvent } from "@/lib/analytics/ga"
import { type PricingTiers } from "@/lib/pricing"

interface BookingWidgetProps {
  pricing: PricingTiers
  listingId?: string
  listingTitle?: string
  serviceType?: string
}

export function BookingWidget({ pricing, listingId, listingTitle, serviceType }: BookingWidgetProps) {
  const price = pricing.price_solo ?? 0

  function handleReserveClick() {
    if (!listingId) return

    trackGaEvent("begin_checkout", {
      listing_id: listingId,
      item_name: listingTitle,
      item_category: serviceType,
      value: price,
      currency: "USD",
    })

    trackMetaEvent("InitiateCheckout", {
      content_ids: [listingId],
      content_type: "product",
      value: price,
      currency: "USD",
    }, {
      eventId: `initiate_checkout_${listingId}_${Date.now()}`,
    })
  }

  return (
    <div className="card-base space-y-4 p-4">
      <p className="type-price">From ${price}/person/hr</p>
      <PricingTable pricing={pricing} />
      <Button className="btn-primary w-full" onClick={handleReserveClick}>
        Reserve
      </Button>
    </div>
  )
}
