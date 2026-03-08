import { calculateBookingTotal, type PricingTiers } from "@/lib/pricing"

export function PriceSummary({
  pricing,
  guestCount,
  durationHours,
}: {
  pricing: PricingTiers
  guestCount: number
  durationHours: number
}) {
  const totals = calculateBookingTotal(pricing, guestCount, durationHours)

  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>${totals.subtotal.toFixed(0)}</span>
      </div>
      <div className="flex justify-between">
        <span>Service fee</span>
        <span>${totals.serviceFee.toFixed(0)}</span>
      </div>
      <div className="mt-2 flex justify-between border-t pt-2 font-medium">
        <span>Total</span>
        <span>${totals.total.toFixed(0)}</span>
      </div>
    </div>
  )
}
