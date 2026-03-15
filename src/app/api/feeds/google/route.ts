import { NextRequest, NextResponse } from "next/server"

import {
  formatFeedPrice,
  getListingsForFeed,
  getServiceLabel,
} from "@/lib/feeds/get-listings-for-feed"

export const dynamic = "force-dynamic"
export const revalidate = 0

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export async function GET(request: NextRequest) {
  try {
    const token =
      request.headers.get("x-feed-token") ?? new URL(request.url).searchParams.get("token")
    if (process.env.FEED_API_TOKEN && token !== process.env.FEED_API_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const listings = await getListingsForFeed()

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://usethrml.com"
    const now = new Date().toUTCString()

    const items = listings
      .map(
        (listing) => `
    <item>
      <g:id>${escapeXml(listing.id)}</g:id>
      <title><![CDATA[${listing.title}]]></title>
      <description><![CDATA[${listing.description.slice(0, 5000)}]]></description>
      <link>${escapeXml(listing.url)}</link>
      ${listing.image_url ? `<g:image_link>${escapeXml(listing.image_url)}</g:image_link>` : ""}
      <g:price>${formatFeedPrice(listing.price)}</g:price>
      <g:availability>${escapeXml(listing.availability)}</g:availability>
      <g:condition>new</g:condition>
      <g:brand>Thrml</g:brand>
      <g:product_type>${escapeXml(getServiceLabel(listing.service_type))}</g:product_type>
      <g:custom_label_0>${escapeXml(listing.service_type)}</g:custom_label_0>
      <g:custom_label_1>${escapeXml(`${listing.location_city}, ${listing.location_state}`)}</g:custom_label_1>
      <g:custom_label_2>${escapeXml(listing.session_type)}</g:custom_label_2>
      <g:identifier_exists>no</g:identifier_exists>
    </item>`
      )
      .join("\n")

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Thrml — Private Wellness Spaces</title>
    <link>${escapeXml(appUrl)}</link>
    <description>Book private saunas, cold plunges, float tanks and more near you.</description>
    <lastBuildDate>${escapeXml(now)}</lastBuildDate>
    ${items}
  </channel>
</rss>`

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    })
  } catch (error) {
    console.error("Google feed error:", error)
    return new NextResponse("Feed generation failed", { status: 500 })
  }
}
