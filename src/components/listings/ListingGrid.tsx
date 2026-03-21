"use client"

import { ListingCard, type ListingCardData } from "@/components/listings/ListingCard"

export function ListingGrid({
  listings,
  fromPath,
  prioritizeFirstImage,
}: {
  listings: ListingCardData[]
  fromPath?: string
  prioritizeFirstImage?: boolean
}) {
  if (!listings.length) {
    return <p className="type-label">No listings found.</p>
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {listings.map((listing, index) => (
        <div key={listing.id} className="reveal" style={{ transitionDelay: `${Math.min(index * 60, 300)}ms` }}>
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
