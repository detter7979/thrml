import { createClient } from "./server"
import {
  FALLBACK_SERVICE_TYPES,
  getFallbackServiceType,
  isServiceTypeId,
  type ServiceTypeMeta,
} from "@/lib/service-types"

export async function getNearbyListings(
  lat: number,
  lng: number,
  radiusMiles = 10,
  serviceType?: string
) {
  const supabase = await createClient()
  const delta = radiusMiles / 69

  let query = supabase
    .from("listings")
    .select(
      "id, host_id, title, description, service_type, sauna_type, session_type, is_active, is_featured, price_solo, price_2, price_3, price_4plus, location, location_address, city, state, country, lat, lng, created_at, listing_photos(url, order_index), listing_ratings(avg_rating, review_count)"
    )
    .eq("is_active", true)
    .gte("lat", lat - delta)
    .lte("lat", lat + delta)
    .gte("lng", lng - delta)
    .lte("lng", lng + delta)
    .order("is_featured", { ascending: false })

  if (serviceType && serviceType !== "all") {
    query = query.eq("service_type", serviceType)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch nearby listings: ${error.message}`)
  }

  return data ?? []
}

export async function getServiceTypes(): Promise<ServiceTypeMeta[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("service_types")
    .select("id, display_name, icon, tagline, booking_model, health_disclaimer")
    .order("display_name", { ascending: true })

  if (error || !data) {
    return FALLBACK_SERVICE_TYPES
  }

  const rowsById = new Map<string, Record<string, unknown>>()
  for (const row of data as Record<string, unknown>[]) {
    const rawId = typeof row.id === "string" ? row.id : ""
    if (!isServiceTypeId(rawId)) continue
    rowsById.set(rawId, row)
  }

  const mapped = FALLBACK_SERVICE_TYPES.map((fallback) => {
    const row = rowsById.get(fallback.id)
    if (!row) return fallback
    return {
      id: fallback.id,
      display_name:
        typeof row.display_name === "string" ? row.display_name : fallback.display_name,
      icon: typeof row.icon === "string" ? row.icon : fallback.icon,
      tagline:
        typeof row.tagline === "string" ? row.tagline : fallback.tagline,
      booking_model:
        row.booking_model === "fixed_session" || row.booking_model === "hourly"
          ? row.booking_model
          : fallback.booking_model,
      health_disclaimer:
        typeof row.health_disclaimer === "string" ? row.health_disclaimer : fallback.health_disclaimer,
    }
  })

  return mapped.length ? mapped : FALLBACK_SERVICE_TYPES
}
