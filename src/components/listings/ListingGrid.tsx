import { ListingCard, type ListingCardData } from "@/components/listings/ListingCard"

export function ListingGrid({ listings }: { listings: ListingCardData[] }) {
  if (!listings.length) {
    return <p className="type-label">No listings found.</p>
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  )
}
