import type { ListingCardData } from "@/components/listings/ListingCard"

/** Photographed, priced saunas required before the page leads with booking. */
export const GUEST_CATALOG_MIN = 8

export type GuestLandingMode = "catalog" | "waitlist"

const MARKET_STATE_BY_SLUG: Record<string, string> = {
  seattle: "WA",
}

export function guestLandingMode(photographedCount: number): GuestLandingMode {
  return photographedCount >= GUEST_CATALOG_MIN ? "catalog" : "waitlist"
}

export function isPhotographedGuestListing(listing: Pick<ListingCardData, "photoUrl" | "priceSolo">): boolean {
  return Boolean(listing.photoUrl) && Number.isFinite(listing.priceSolo) && listing.priceSolo > 0
}

export function guestMarket(citySlug: string, cityDisplay: string): { city: string; state: string | null } {
  const state = MARKET_STATE_BY_SLUG[citySlug.trim().toLowerCase()] ?? null
  return { city: cityDisplay, state }
}

export function guestPlaceLabel(listing: Pick<ListingCardData, "city" | "state" | "location">): string | null {
  const city = listing.city?.trim()
  const state = listing.state?.trim()
  if (city && state) return `${city}, ${state}`
  if (city) return city
  const location = listing.location?.trim()
  if (!location || location.toLowerCase().includes("after booking")) return null
  return location
}

export function guestPriceLabel(listing: Pick<ListingCardData, "priceSolo" | "bookingModel">): string | null {
  if (!Number.isFinite(listing.priceSolo) || listing.priceSolo <= 0) return null
  const amount = Number.isInteger(listing.priceSolo)
    ? `$${listing.priceSolo}`
    : `$${listing.priceSolo.toFixed(2)}`
  if (listing.bookingModel === "fixed_session") return `${amount} / session`
  return `from ${amount} / person / hr`
}

export function guestListingHref(id: string, fromPath: string): string {
  return `/listings/${id}?from=${encodeURIComponent(fromPath)}`
}

/** Dev-only stand-in so the booking layout can be reviewed before inventory exists. */
export function guestLandingPreviewCards(state: string | null): ListingCardData[] {
  const names = [
    "Cedar hour",
    "The barrel on the deck",
    "Evening heat",
    "A room for one",
    "After the rain",
    "Sunday steam",
    "The quiet yard",
    "Last light",
  ]
  const neighborhoods = [
    "Ballard",
    "West Seattle",
    "Queen Anne",
    "Fremont",
    "Capitol Hill",
    "Beacon Hill",
    "Green Lake",
    "Madison Park",
  ]
  return names.map((title, index) => ({
    id: `preview-${index + 1}`,
    title,
    location: state ? `${neighborhoods[index]}, ${state}` : neighborhoods[index],
    city: neighborhoods[index],
    state,
    serviceTypeId: "sauna",
    bookingModel: index % 3 === 0 ? "fixed_session" : "hourly",
    photoUrl: index % 2 === 0 ? "/hero-main-bg.jpg" : "/hero-sauna.png",
    priceSolo: index % 3 === 0 ? 68 : 42 + index,
  }))
}
