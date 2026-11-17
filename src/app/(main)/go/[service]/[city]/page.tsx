import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { GuestLandingView } from "@/components/marketing/guest-landing-view"
import { getServiceType } from "@/lib/constants/service-types"
import { guestLaunchLabel, isGuestPreLaunch, isLaunchVisibleServiceType } from "@/lib/launch-config"
import {
  guestLandingMode,
  guestLandingPreviewCards,
  guestMarket,
  isPhotographedGuestListing,
} from "@/lib/marketing/guest-landing"
import {
  citySlugToDisplayName,
  fetchListingsForLocalLanding,
  mapRowToListingCard,
  resolveServiceFromSlug,
} from "@/lib/seo/local-service-landing"

/**
 * Paid-traffic landing page for guests (Meta → /go/saunas/seattle).
 * Waitlist until a photographed set is bookable, then the same URL becomes a catalog.
 * Not indexed.
 */

type PageParams = { service: string; city: string }
type PageSearch = { preview?: string }

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { service, city } = await params
  const resolved = resolveServiceFromSlug(service)
  const label = resolved ? getServiceType(resolved.serviceType)?.label ?? "Wellness space" : "Wellness space"
  return {
    title: { absolute: `Private ${label.toLowerCase()}s in ${citySlugToDisplayName(city)} | thrml` },
    description: "Book a private sauna hosted by a local, by the session. No memberships.",
    robots: { index: false, follow: false },
  }
}

export default async function GuestLandingPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>
  searchParams: Promise<PageSearch>
}) {
  const { service, city: citySlug } = await params
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(citySlug)) notFound()

  const resolved = resolveServiceFromSlug(service)
  if (!resolved || !isLaunchVisibleServiceType(resolved.serviceType)) notFound()

  const cityDisplay = citySlugToDisplayName(citySlug)
  const label = getServiceType(resolved.serviceType)?.label ?? "Sauna"
  const labelLower = label.toLowerCase()
  const market = guestMarket(citySlug, cityDisplay)
  const fromPath = `/go/${resolved.canonicalSlug}/${citySlug}`

  const preview =
    process.env.NODE_ENV !== "production" && (await searchParams).preview === "catalog"
  let cards = preview ? guestLandingPreviewCards(market.state) : []
  if (!preview) {
    try {
      const rows = await fetchListingsForLocalLanding(resolved.serviceType, cityDisplay, citySlug)
      cards = rows.map(mapRowToListingCard)
    } catch (error) {
      console.error("[guest landing] listings failed", error)
    }
  }
  const photographed = cards.filter(isPhotographedGuestListing)
  const mode = guestLandingMode(photographed.length)

  return (
    <GuestLandingView
      mode={mode}
      cityDisplay={cityDisplay}
      labelLower={labelLower}
      preLaunch={isGuestPreLaunch()}
      launchLabel={guestLaunchLabel()}
      featured={mode === "catalog" ? photographed[0] : null}
      rest={mode === "catalog" ? photographed.slice(1) : []}
      early={mode === "waitlist" ? photographed : []}
      fromPath={fromPath}
      marketCity={market.city}
      marketState={market.state}
    />
  )
}
