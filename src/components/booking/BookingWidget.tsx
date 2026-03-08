import { PricingTable } from "@/components/listings/PricingTable"
import { Button } from "@/components/ui/button"
import { type PricingTiers } from "@/lib/pricing"

export function BookingWidget({ pricing }: { pricing: PricingTiers }) {
  return (
    <div className="card-base space-y-4 p-4">
      <p className="type-price">From ${pricing.price_solo}/person/hr</p>
      <PricingTable pricing={pricing} />
      <Button className="btn-primary w-full">Reserve</Button>
    </div>
  )
}
