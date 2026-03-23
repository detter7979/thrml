import { NextRequest, NextResponse } from "next/server"

import {
  formatFeedPrice,
  getListingsForFeed,
  getServiceLabel,
} from "@/lib/feeds/get-listings-for-feed"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Escape a CSV field: wrap in quotes and escape internal quotes
function csvField(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value)
  // Always quote — simplest safe approach
  return `"${str.replace(/"/g, '""')}"`
}

export async function GET(request: NextRequest) {
  try {
    // Use header token first; for query param, read raw to avoid + → space decoding
    const headerToken = request.headers.get("x-feed-token")
    const rawSearch = new URL(request.url).search
    const rawTokenMatch = rawSearch.match(/[?&]token=([^&]*)/)
    const queryToken = rawTokenMatch ? decodeURIComponent(rawTokenMatch[1]) : null
    const token = headerToken ?? queryToken

    if (process.env.FEED_API_TOKEN && token !== process.env.FEED_API_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const listings = await getListingsForFeed()

    // Meta catalog CSV headers (required + recommended fields)
    const headers = [
      "id",
      "title",
      "description",
      "availability",
      "condition",
      "price",
      "link",
      "image_link",
      "brand",
      "product_type",
      "custom_label_0",
      "custom_label_1",
      "custom_label_2",
    ]

    const rows = listings.map((listing) => [
      csvField(listing.id),
      csvField(listing.title),
      csvField(listing.description.slice(0, 5000)),
      csvField(listing.availability),
      csvField("new"),
      csvField(formatFeedPrice(listing.price)),
      csvField(listing.url),
      csvField(listing.image_url ?? ""),
      csvField("Thrml"),
      csvField(getServiceLabel(listing.service_type)),
      csvField(listing.service_type),
      csvField(listing.location_city),
      csvField(listing.session_type),
    ])

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n")

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    })
  } catch (error) {
    console.error("Meta feed error:", error)
    return NextResponse.json({ error: "Feed generation failed" }, { status: 500 })
  }
}
