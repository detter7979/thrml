import { NextRequest, NextResponse } from "next/server"

import { getGA4AccessToken } from "@/lib/analytics/ga4-auth"
import { createAdminClient } from "@/lib/supabase/admin"

function yesterday() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("cron_secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const propertyId = process.env.GA4_PROPERTY_ID
  if (!propertyId) {
    return NextResponse.json({ error: "GA4_PROPERTY_ID not set" }, { status: 500 })
  }

  const propertyResource = propertyId.startsWith("properties/") ? propertyId : `properties/${propertyId}`

  const date = yesterday()
  const accessToken = await getGA4AccessToken()

  const body = {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: "eventName" }, { name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: {
          values: ["session_start", "view_listing", "begin_checkout", "purchase"],
        },
      },
    },
  }

  const gaRes = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/${propertyResource}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  )

  if (!gaRes.ok) {
    const err = await gaRes.text()
    console.error("[sync-ga4] API error", err)
    return NextResponse.json({ error: "GA4 API failed", detail: err }, { status: 500 })
  }

  const { rows = [] } = (await gaRes.json()) as {
    rows?: Array<{
      dimensionValues: Array<{ value: string }>
      metricValues: Array<{ value: string }>
    }>
  }

  const channelMap = new Map<
    string,
    { sessions: number; view_listing: number; begin_checkout: number; purchases: number }
  >()

  const normalizeChannel = (raw: string): string => {
    const lower = raw.toLowerCase()
    if (lower.includes("paid search") || lower.includes("google")) return "google_ads"
    if (lower.includes("paid social") || lower.includes("meta") || lower.includes("facebook")) return "meta"
    if (lower.includes("organic")) return "organic"
    if (lower.includes("direct")) return "direct"
    return "other"
  }

  for (const row of rows) {
    const eventName = row.dimensionValues[0].value
    const rawChannel = row.dimensionValues[1].value
    const channel = normalizeChannel(rawChannel)
    const count = parseInt(row.metricValues[0].value, 10)

    if (!channelMap.has(channel)) {
      channelMap.set(channel, { sessions: 0, view_listing: 0, begin_checkout: 0, purchases: 0 })
    }
    const entry = channelMap.get(channel)!

    if (eventName === "session_start") entry.sessions += count
    else if (eventName === "view_listing") entry.view_listing += count
    else if (eventName === "begin_checkout") entry.begin_checkout += count
    else if (eventName === "purchase") entry.purchases += count
  }

  const allEntry = { sessions: 0, view_listing: 0, begin_checkout: 0, purchases: 0 }
  for (const v of channelMap.values()) {
    allEntry.sessions += v.sessions
    allEntry.view_listing += v.view_listing
    allEntry.begin_checkout += v.begin_checkout
    allEntry.purchases += v.purchases
  }
  channelMap.set("all", allEntry)

  const supabase = createAdminClient()
  let upserted = 0

  for (const [channel, metrics] of channelMap.entries()) {
    const { error } = await supabase.from("analytics_daily").upsert(
      {
        date,
        channel,
        campaign_id: "",
        campaign_name: "",
        sessions: metrics.sessions,
        view_listing: metrics.view_listing,
        begin_checkout: metrics.begin_checkout,
        purchases: metrics.purchases,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "date,channel,campaign_id" }
    )

    if (error) {
      console.error(`[sync-ga4] upsert failed for ${channel}`, error.message)
    } else {
      upserted++
    }
  }

  return NextResponse.json({ ok: true, date, upserted })
}
