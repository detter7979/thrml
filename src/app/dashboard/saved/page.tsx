"use client"

import Link from "next/link"
import { Heart } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { ListingCard, type ListingCardData } from "@/components/listings/ListingCard"
import { getServiceType, SERVICE_TYPES } from "@/lib/constants/service-types"

type SavedRow = {
  listing_id: string
  created_at: string
  listings: SavedListing | null
}

type SavedListing = {
  id: string
  title: string | null
  service_type: string | null
  session_type: "hourly" | "fixed_session" | null
  price_solo: number | null
  fixed_session_price: number | null
  location_city: string | null
  listing_photos?: { url?: string | null; order_index?: number | null }[]
  listing_ratings?: { avg_overall?: number | null; review_count?: number | null }[] | null
}

function serviceMeta(serviceType: string | null | undefined) {
  return getServiceType(serviceType ?? "")
}

export default function DashboardSavedPage() {
  const [rows, setRows] = useState<SavedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [serviceFilter, setServiceFilter] = useState<string>("all")
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())
  const removeTimersRef = useRef<Record<string, number>>({})

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const response = await fetch("/api/saved")
      if (!mounted) return
      if (!response.ok) {
        setRows([])
        setLoading(false)
        return
      }

      const payload = (await response.json()) as { saved?: SavedRow[] }
      setRows(payload.saved ?? [])
      setLoading(false)
    }

    void load()
    return () => {
      mounted = false
      Object.values(removeTimersRef.current).forEach((timerId) => window.clearTimeout(timerId))
      removeTimersRef.current = {}
    }
  }, [])

  const listingCards = useMemo(() => {
    const mapped = rows
      .filter((row) => row.listings?.id)
      .map((row) => {
        const listing = row.listings!
        const service = serviceMeta(listing.service_type)
        const photos = [...(listing.listing_photos ?? [])].sort(
          (a, b) => (a.order_index ?? 999) - (b.order_index ?? 999)
        )
        const rating = Number(listing.listing_ratings?.[0]?.avg_overall ?? 0)
        const reviewCount = Number(listing.listing_ratings?.[0]?.review_count ?? 0)

        return {
          listingId: listing.id,
          createdAt: row.created_at,
          serviceType: listing.service_type ?? "sauna",
          price: Number(listing.price_solo ?? listing.fixed_session_price ?? 0),
          rating,
          card: {
            id: listing.id,
            title: listing.title ?? "Thrml space",
            location: listing.location_city ?? "Location shared after booking",
            serviceTypeId: listing.service_type ?? "sauna",
            serviceTypeName: service?.label ?? "Sauna",
            serviceTypeIcon: service?.emoji ?? "🔥",
            bookingModel:
              listing.session_type === "fixed_session" || listing.fixed_session_price
                ? "fixed_session"
                : "hourly",
            photoUrl:
              photos.find((item) => typeof item.url === "string" && item.url)?.url ?? null,
            priceSolo: Number(listing.price_solo ?? listing.fixed_session_price ?? 0),
            rating: rating || undefined,
            reviewCount: reviewCount || undefined,
            initialSaved: true,
          } satisfies ListingCardData,
        }
      })

    const filtered = serviceFilter === "all" ? mapped : mapped.filter((item) => item.serviceType === serviceFilter)
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return filtered
  }, [rows, serviceFilter])

  const savedCount = rows.length

  function handleSavedChange(listingId: string, nextSaved: boolean) {
    if (nextSaved) {
      if (removeTimersRef.current[listingId]) {
        window.clearTimeout(removeTimersRef.current[listingId])
        delete removeTimersRef.current[listingId]
      }
      setRemovingIds((current) => {
        const copy = new Set(current)
        copy.delete(listingId)
        return copy
      })
      return
    }

    setRemovingIds((current) => new Set(current).add(listingId))
    removeTimersRef.current[listingId] = window.setTimeout(() => {
      setRows((current) => current.filter((row) => row.listing_id !== listingId))
      setRemovingIds((current) => {
        const copy = new Set(current)
        copy.delete(listingId)
        return copy
      })
      delete removeTimersRef.current[listingId]
    }, 200)
  }

  const filterOptions = [
    { id: "all", label: "All" },
    ...SERVICE_TYPES.map((item) => ({
      id: item.value,
      label: item.label,
    })),
  ]

  return (
    <div className="space-y-5 px-4 py-6 md:px-8 md:py-8">
      <div className="space-y-1">
        <h1 className="font-serif text-[28px] text-[#1A1410]">Saved Spaces</h1>
        <p className="text-sm text-[#6D5E51]">{savedCount} spaces saved</p>
      </div>

      {loading ? <div className="h-24 animate-pulse rounded-2xl bg-white" /> : null}

      {!loading && savedCount === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
          <Heart className="mx-auto size-12 text-[#D4CCC2]" />
          <p className="mt-4 font-medium text-[#2E241D]">Nothing saved yet</p>
          <p className="mt-1 text-sm text-[#6D5E51]">Tap the heart on any space to save it for later</p>
          <Link href="/explore" className="mt-5 inline-flex text-sm font-medium text-[#C75B3A]">
            Explore spaces →
          </Link>
        </div>
      ) : null}

      {!loading && savedCount > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {filterOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setServiceFilter(option.id)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm ${
                    serviceFilter === option.id
                      ? "border-brand-500 bg-brand-100 text-brand-900"
                      : "bg-white text-warm-600"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {listingCards.map((item) => {
              const isRemoving = removingIds.has(item.listingId)
              return (
                <div
                  key={item.listingId}
                  className={`overflow-hidden transition-all duration-200 ${
                    isRemoving ? "max-h-0 scale-[0.98] opacity-0" : "max-h-[520px] opacity-100"
                  }`}
                >
                  <ListingCard
                    listing={item.card}
                    onSavedChange={(saved) => handleSavedChange(item.listingId, saved)}
                  />
                </div>
              )
            })}
          </div>
          {listingCards.length === 0 ? (
            <div className="rounded-2xl bg-white p-6 text-sm text-[#6D5E51] shadow-sm">
              Some saved spaces are no longer available to view.
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
