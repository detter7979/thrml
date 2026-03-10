import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, host_id, title, description, service_type, sauna_type, session_type, is_active, is_featured, is_draft, fixed_session_price, price_solo, price_2, price_3, price_4plus, location, location_address, location_city, location_state, city, state, country, lat, lng, created_at, listing_photos(url, order_index), listing_ratings(avg_overall, review_count)"
    )
    .eq("is_active", true)
    .eq("is_draft", false)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const listings = (data ?? []).map((listing: Record<string, unknown>) => {
    const city =
      typeof listing.city === "string"
        ? listing.city
        : typeof listing.location_city === "string"
          ? listing.location_city
          : ""
    const state =
      typeof listing.state === "string"
        ? listing.state
        : typeof listing.location_state === "string"
          ? listing.location_state
          : ""
    const country = typeof listing.country === "string" ? listing.country : ""
    const parts = [city, state, country].filter((part) => part.length > 0)
    const derivedLocation = parts.join(", ")
    const fallbackLocation =
      typeof listing.location === "string" ? listing.location : "Location available after booking"

    return {
      ...listing,
      service_type: typeof listing.service_type === "string" ? listing.service_type : "sauna",
      location: derivedLocation || fallbackLocation,
    }
  })

  return NextResponse.json({ listings })
}
