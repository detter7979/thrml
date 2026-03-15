import { createClient } from "@/lib/supabase/server"

export type FeedListing = {
  id: string
  title: string
  description: string
  service_type: string
  price: number
  session_type: string
  location_address: string
  location_city: string
  location_state: string
  lat: number
  lng: number
  url: string
  image_url: string | null
  availability: string
}

type ListingPhoto = {
  url: string | null
  order_index: number | null
}

type ListingRow = {
  id: string
  title: string | null
  description: string | null
  service_type: string | null
  session_type: string | null
  fixed_session_price: number | null
  price_solo: number | null
  location_address: string | null
  location_city: string | null
  location_state: string | null
  lat: number | null
  lng: number | null
  listing_photos: ListingPhoto[] | null
}

export async function getListingsForFeed(): Promise<FeedListing[]> {
  const supabase = await createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://usethrml.com"

  const { data: listings, error } = await supabase
    .from("listings")
    .select(
      `
      id,
      title,
      description,
      service_type,
      session_type,
      fixed_session_price,
      price_solo,
      location_address,
      location_city,
      location_state,
      lat,
      lng,
      is_active,
      is_draft,
      listing_photos (
        url,
        order_index
      )
    `
    )
    .eq("is_active", true)
    .eq("is_draft", false)
    .order("created_at", { ascending: false })

  if (error || !listings) return []

  return (listings as ListingRow[]).map((listing) => {
    const price =
      listing.session_type === "fixed_session"
        ? Number(listing.fixed_session_price ?? 0)
        : Number(listing.price_solo ?? 0)

    const sortedPhotos = (listing.listing_photos ?? []).slice().sort((a, b) => {
      const aOrder = a.order_index ?? 999
      const bOrder = b.order_index ?? 999
      return aOrder - bOrder
    })
    const imageUrl = sortedPhotos[0]?.url ?? null

    return {
      id: listing.id,
      title: listing.title ?? "thrml Listing",
      description: listing.description ?? "",
      service_type: listing.service_type ?? "wellness_space",
      price,
      session_type: listing.session_type ?? "hourly",
      location_address: listing.location_address ?? "",
      location_city: listing.location_city ?? "",
      location_state: listing.location_state ?? "",
      lat: Number(listing.lat ?? 0),
      lng: Number(listing.lng ?? 0),
      url: `${appUrl}/listings/${listing.id}`,
      image_url: imageUrl,
      availability: "in stock",
    }
  })
}

export function getServiceLabel(serviceType: string): string {
  const labels: Record<string, string> = {
    sauna: "Sauna",
    cold_plunge: "Cold Plunge",
    hot_tub: "Hot Tub",
    infrared: "Infrared Sauna",
    float_tank: "Float Tank",
    pemf: "PEMF Therapy",
    halotherapy: "Halotherapy",
    hyperbaric: "Hyperbaric Chamber",
  }
  return labels[serviceType] ?? "Wellness Space"
}

export function formatFeedPrice(price: number): string {
  return `${price.toFixed(2)} USD`
}
