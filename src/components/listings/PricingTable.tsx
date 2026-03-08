import { getPricePerPerson, type PricingTiers } from "@/lib/pricing"

export function PricingTable({ pricing }: { pricing: PricingTiers }) {
  const rows = [1, 2, 3, 4]

  return (
    <div className="card-base p-4">
      <p className="mb-3 font-medium">Group pricing</p>
      <div className="space-y-2 text-sm">
        {rows.map((guestCount) => (
          <div key={guestCount} className="flex justify-between">
            <span className="type-label">{guestCount === 4 ? "4+ guests" : `${guestCount} guest(s)`}</span>
            <span>${getPricePerPerson(pricing, guestCount)}/person/hr</span>
          </div>
        ))}
      </div>
    </div>
  )
}
