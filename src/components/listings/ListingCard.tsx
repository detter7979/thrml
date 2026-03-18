"use client"

import { motion } from "framer-motion"
import Link from "next/link"

import { SaveButton } from "@/components/listings/SaveButton"
import { Badge } from "@/components/ui/badge"

export type ListingCardData = {
  id: string
  title: string
  location: string
  city?: string | null
  state?: string | null
  serviceTypeId?: string | null
  serviceTypeName?: string | null
  serviceTypeIcon?: string | null
  bookingModel?: "hourly" | "fixed_session"
  photoUrl?: string | null
  priceSolo: number
  rating?: number | null
  reviewCount?: number
  initialSaved?: boolean
}

export function ListingCard({
  listing,
  onSavedChange,
  fromPath,
}: {
  listing: ListingCardData
  onSavedChange?: (saved: boolean) => void
  fromPath?: string
}) {
  const reviewCount = Number(listing.reviewCount ?? 0)
  const hasRating =
    reviewCount >= 1 && typeof listing.rating === "number" && Number.isFinite(listing.rating)
  const listingHref = fromPath
    ? `/listings/${listing.id}?from=${encodeURIComponent(fromPath)}`
    : `/listings/${listing.id}`

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <Link href={listingHref} className="card-base group block p-3">
        <div className="relative mb-3 h-44 w-full overflow-hidden rounded-xl bg-warm-100">
          {listing.photoUrl ? (
            <img
              src={listing.photoUrl}
              alt={`${listing.title} in ${
                listing.city && listing.state ? `${listing.city}, ${listing.state}` : listing.location
              }`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-warm-600">No photo</div>
          )}
          <div className="absolute top-3 right-3">
            <SaveButton
              listingId={listing.id}
              listingMeta={{
                serviceType: listing.serviceTypeId ?? null,
                city: listing.city ?? null,
              }}
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
            {hasRating ? (
              <p className="text-sm text-[#5C4D40]">
                ★ {Number(listing.rating).toFixed(1)} ({reviewCount})
              </p>
            ) : (
              <span className="rounded-full bg-[#FDEBDD] px-2 py-0.5 text-xs text-[#C75B3A]">New</span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
