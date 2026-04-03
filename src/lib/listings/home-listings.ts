import { createClient } from "@/lib/supabase/server"

/** Fields required for home page cards, trending strip, and filters — no description or heavy joins. */
const HOME_LISTINGS_SELECT =
  "id, title, service_type, session_type, is_featured, fixed_session_price, price_solo, location_city, city, location_state, state, country, location, created_at, listing_photos(url, order_index), listing_ratings(avg_overall, review_count)"

export type HomeListingCardRow = {
  id: string
  title: string | null
  service_type: string | null
  session_type: string | null
  fixed_session_price: number | null
  price_solo: number | null
  /** Derived single-line location for card + search */
  location: string
  listing_photos?: { url?: string | null; order_index?: number | null }[] | null
  listing_ratings?: { avg_overall?: number | null; review_count?: number | null }[] | null
}

function deriveLocation(listing: Record<string, unknown>): string {
  const city =
    (typeof listing.city === "string" && listing.city.trim()) ||
    (typeof listing.location_city === "string" && listing.location_city.trim()) ||
    ""
  const state =
    (typeof listing.state === "string" && listing.state.trim()) ||
    (typeof listing.location_state === "string" && listing.location_state.trim()) ||
    ""
  const country = typeof listing.country === "string" ? listing.country.trim() : ""
  const parts: string[] = []
  const seen = new Set<string>()
  for (const part of [city, state, country]) {
    if (!part) continue
    const key = part.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    parts.push(part)
  }
  if (parts.length > 0) return parts.join(", ")
  const fallback =
    (typeof listing.location === "string" && listing.location.trim()) || "Location available after booking"
  return fallback
}

/** Server-only: fast payload for home grid (caps row count; separate count for totals). */
export async function getHomeListingsForCards(params?: { limit?: number }) {
  const limit = params?.limit ?? 250
  const supabase = await createClient()

  const [listingsResult, countResult] = await Promise.all([
    supabase
      .from("listings")
      .select(HOME_LISTINGS_SELECT)
      .eq("is_active", true)
      .eq("is_deleted", false)
      .eq("is_draft", false)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("is_deleted", false)
      .eq("is_draft", false),
  ])

  const data = (listingsResult.data ?? []) as Record<string, unknown>[]
  const listings: HomeListingCardRow[] = data.map((row) => {
    const id = typeof row.id === "string" ? row.id : ""
    return {
      id,
      title: typeof row.title === "string" ? row.title : null,
      service_type: typeof row.service_type === "string" ? row.service_type : "sauna",
      session_type: typeof row.session_type === "string" ? row.session_type : null,
      fixed_session_price:
        typeof row.fixed_session_price === "number" ? row.fixed_session_price : Number(row.fixed_session_price ?? null),
      price_solo: typeof row.price_solo === "number" ? row.price_solo : Number(row.price_solo ?? null),
      location: deriveLocation(row),
      listing_photos: row.listing_photos as HomeListingCardRow["listing_photos"],
      listing_ratings: row.listing_ratings as HomeListingCardRow["listing_ratings"],
    }
  })

  return {
    listings,
    totalActiveCount: countResult.count ?? listings.length,
    error: listingsResult.error?.message ?? countResult.error?.message ?? null,
  }
}
