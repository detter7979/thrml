import Link from "next/link"

import { SaveButton } from "@/components/listings/SaveButton"
import { Badge } from "@/components/ui/badge"

export type ListingCardData = {
  id: string
  title: string
  location: string
  serviceTypeId?: string | null
  serviceTypeName?: string | null
  serviceTypeIcon?: string | null
  bookingModel?: "hourly" | "fixed_session"
  photoUrl?: string | null
  priceSolo: number
  rating?: number
  reviewCount?: number
  initialSaved?: boolean
}

export function ListingCard({
  listing,
  onSavedChange,
}: {
  listing: ListingCardData
  onSavedChange?: (saved: boolean) => void
}) {
  return (
    <Link href={`/listing/${listing.id}`} className="card-base group block p-3">
      <div className="relative mb-3 h-44 w-full overflow-hidden rounded-xl bg-warm-100">
        {listing.photoUrl ? (
          <img src={listing.photoUrl} alt={listing.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-warm-600">No photo</div>
        )}
        <div className="absolute top-3 right-3">
          <SaveButton
            listingId={listing.id}
            initialSaved={listing.initialSaved}
            variant="card"
            onSavedChange={onSavedChange}
          />
        </div>
      </div>
      <div className="space-y-1">
        {listing.serviceTypeName ? (
          <Badge variant="secondary">
            <span className="mr-1">{listing.serviceTypeIcon ?? "✨"}</span>
            {listing.serviceTypeName}
          </Badge>
        ) : null}
        <p className="font-medium">{listing.title}</p>
        <p className="type-label">{listing.location}</p>
        <div className="flex items-center justify-between">
          <p className="type-price">
            {listing.bookingModel === "fixed_session"
              ? `$${listing.priceSolo}/session`
              : `from $${listing.priceSolo}/person/hr`}
          </p>
          {Number(listing.reviewCount ?? 0) > 0 ? (
            <p className="text-sm text-[#5C4D40]">
              ★ {Number(listing.rating ?? 0).toFixed(2)} ({Number(listing.reviewCount ?? 0)})
            </p>
          ) : (
            <span className="rounded-full bg-[#FDEBDD] px-2 py-0.5 text-xs text-[#C75B3A]">New</span>
          )}
        </div>
      </div>
    </Link>
  )
}
