"use client"

import { usePlatformFeePercents } from "@/contexts/platform-fees-context"
import { calculateFees } from "@/lib/fees"
import { calculateBookingSubtotal, type PricingTiers } from "@/lib/pricing"

export function PriceSummary({
  pricing,
  guestCount,
  durationHours,
}: {
  pricing: PricingTiers
  guestCount: number
  durationHours: number
}) {
  const feePercents = usePlatformFeePercents()
  const sub = calculateBookingSubtotal(pricing, guestCount, durationHours)
  const totals = calculateFees(sub.subtotal, feePercents.guestFeePercent, feePercents.hostFeePercent)

  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="flex justify-between">
        <span>Space subtotal</span>
        <span>${totals.subtotal.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span>Service fee ({feePercents.guestFeePercent}%)</span>
        <span>${totals.guestFee.toFixed(2)}</span>
      </div>
      <div className="mt-2 flex justify-between border-t pt-2 font-medium">
        <span>Total</span>
        <span>${totals.guestTotal.toFixed(2)}</span>
      </div>
    </div>
  )
}
