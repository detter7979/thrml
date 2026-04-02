"use client"

import Link from "next/link"
import Image from "next/image"
import { motion, useReducedMotion } from "framer-motion"

import { SaveButton } from "@/components/listings/SaveButton"
import { Badge } from "@/components/ui/badge"

const MotionLink = motion.create(Link)

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

const tapSpring = { type: "spring" as const, stiffness: 400, damping: 30 }

export function ListingCard({
  listing,
  onSavedChange,
  fromPath,
  imageHighPriority = false,
}: {
  listing: ListingCardData
  onSavedChange?: (saved: boolean) => void
  fromPath?: string
  imageHighPriority?: boolean
}) {
  const reviewCount = Number(listing.reviewCount ?? 0)
  const hasRating =
    reviewCount >= 1 && typeof listing.rating === "number" && Number.isFinite(listing.rating)
  const listingHref = fromPath
    ? `/listings/${listing.id}?from=${encodeURIComponent(fromPath)}`
    : `/listings/${listing.id}`
  const reduce = useReducedMotion()

  return (
    <MotionLink
      href={listingHref}
      className="card-base group block p-3"
      whileHover={reduce ? undefined : { y: -4 }}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={tapSpring}
    >
      <div className="relative mb-3 h-44 w-full shrink-0 overflow-hidden rounded-xl bg-warm-100">
        {listing.photoUrl ? (
          <Image
            src={listing.photoUrl}
            alt={`${listing.title} in ${
              listing.city && listing.state ? `${listing.city}, ${listing.state}` : listing.location
            }`}
            fill
            className="object-cover transition-transform duration-[380ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
            sizes="(max-width: 640px) min(100vw, 420px), (max-width: 1280px) min(50vw, 520px), min(33vw, 380px)"
            loading={imageHighPriority ? "eager" : "lazy"}
            priority={imageHighPriority}
            {...(imageHighPriority ? { fetchPriority: "high" as const } : {})}
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
        <p className="truncate font-medium">{listing.title}</p>
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
            <span className="rounded-full bg-[#FDEBDD] px-2 py-0.5 text-xs text-[#8B3A20]">New</span>
          )}
        </div>
      </div>
    </MotionLink>
  )
}
