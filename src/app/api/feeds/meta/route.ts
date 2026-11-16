import { NextResponse } from "next/server"

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

export async function GET() {
  try {
    // Public on purpose: the feed only carries what listing pages already show (title, city-level
    // location, price, first photo, URL). A shared-secret token here broke Meta's scheduled fetch
    // for months when the env value changed, and protected nothing that isn't already public.

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
