"use client"

import { ListingCard, type ListingCardData } from "@/components/listings/ListingCard"

export function ListingGrid({
  listings,
  fromPath,
  prioritizeFirstImage,
  /** When true (default), cards use `.reveal` and need a parent wired with `useScrollReveal` or they stay invisible. */
  enableScrollReveal = true,
}: {
  listings: ListingCardData[]
  fromPath?: string
  prioritizeFirstImage?: boolean
  enableScrollReveal?: boolean
}) {
  if (!listings.length) {
    return <p className="type-label">No listings found.</p>
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {listings.map((listing, index) => (
        <div
          key={listing.id}
          className={enableScrollReveal ? "reveal" : undefined}
          style={
            enableScrollReveal
              ? { transitionDelay: `${Math.min(index * 60, 300)}ms` }
              : undefined
          }
        >
          <ListingCard
            listing={listing}
            fromPath={fromPath}
            imageHighPriority={Boolean(prioritizeFirstImage && index === 0)}
          />
        </div>
      ))}
    </div>
  )
}
