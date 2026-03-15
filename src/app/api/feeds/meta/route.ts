import { NextRequest, NextResponse } from "next/server"

import {
  formatFeedPrice,
  getListingsForFeed,
  getServiceLabel,
} from "@/lib/feeds/get-listings-for-feed"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const token =
      request.headers.get("x-feed-token") ?? new URL(request.url).searchParams.get("token")
    if (process.env.FEED_API_TOKEN && token !== process.env.FEED_API_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const listings = await getListingsForFeed()

    const feed = listings.map((listing) => ({
      id: listing.id,
      name: listing.title,
      description: listing.description.slice(0, 5000),
      availability: listing.availability,
      condition: "new",
      price: formatFeedPrice(listing.price),
      link: listing.url,
      image_link: listing.image_url ?? "",
      brand: "Thrml",
      category: getServiceLabel(listing.service_type),
      custom_label_0: listing.service_type,
      custom_label_1: listing.location_city,
      custom_label_2: listing.session_type,
      retailer_id: listing.id,
      latitude: listing.lat,
      longitude: listing.lng,
      address: {
        addr1: listing.location_address,
        city: listing.location_city,
        region: listing.location_state,
        country: "US",
      },
    }))

    return NextResponse.json(
      { data: feed },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
      }
    )
  } catch (error) {
    console.error("Meta feed error:", error)
    return NextResponse.json({ error: "Feed generation failed" }, { status: 500 })
  }
}
