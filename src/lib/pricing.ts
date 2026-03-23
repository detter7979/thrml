export interface PricingTiers {
  price_solo: number
  price_2?: number
  price_3?: number
  price_4plus?: number
}

export interface BookingSubtotal {
  pricePerPerson: number
  subtotal: number
}

export interface DurationOption {
  minutes: number
  label: string
}

export function formatDurationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  if (minutes % 60 === 0) return `${minutes / 60}hr`
  return `${Math.floor(minutes / 60)}hr ${minutes % 60} min`
}

export function getDurationOptions(
  minMins: number,
  maxMins: number,
  increment: number
): DurationOption[] {
  const safeMin = Math.max(30, Math.floor(minMins))
  const safeMax = Math.max(safeMin, Math.floor(maxMins))
  const safeIncrement = Math.max(30, Math.floor(increment))
  const options: DurationOption[] = []
  for (let m = safeMin; m <= safeMax; m += safeIncrement) {
    options.push({
      minutes: m,
      label: formatDurationLabel(m),
    })
  }
  return options
}

export function getPricePerPerson(tiers: PricingTiers, guestCount: number): number {
  if (guestCount <= 1) return tiers.price_solo
  if (guestCount === 2) return tiers.price_2 ?? tiers.price_solo
  if (guestCount === 3) return tiers.price_3 ?? tiers.price_2 ?? tiers.price_solo
  return tiers.price_4plus ?? tiers.price_3 ?? tiers.price_2 ?? tiers.price_solo
}

export function calculateBookingSubtotal(
  tiers: PricingTiers,
  guestCount: number,
  durationHours: number
): BookingSubtotal {
  const safeGuests = Math.max(1, guestCount)
  const safeDuration = Math.max(0, durationHours)

  const pricePerPerson = getPricePerPerson(tiers, safeGuests)
  const subtotal = pricePerPerson * safeGuests * safeDuration

  return { pricePerPerson, subtotal }
}
