import { NextRequest, NextResponse } from "next/server"

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

  const token = process.env.META_MARKETING_API_TOKEN
  const adAccountId = process.env.META_AD_ACCOUNT_ID
  if (!token || !adAccountId) {
    return NextResponse.json(
      { error: "META_MARKETING_API_TOKEN or META_AD_ACCOUNT_ID not set" },
      { status: 500 }
    )
  }

  const date = yesterday()

  const fields = "campaign_id,campaign_name,impressions,clicks,spend"
  const timeRange = encodeURIComponent(JSON.stringify({ since: date, until: date }))
  const url =
    `https://graph.facebook.com/v22.0/${adAccountId}/insights?` +
    `fields=${fields}&time_range=${timeRange}` +
    `&level=campaign&access_token=${encodeURIComponent(token)}`

  const metaRes = await fetch(url)
  if (!metaRes.ok) {
    const err = await metaRes.text()
    console.error("[sync-meta] API error", err)
    return NextResponse.json({ error: "Meta API failed", detail: err }, { status: 500 })
  }

  const { data = [] } = (await metaRes.json()) as {
    data?: Array<{
      campaign_id: string
      campaign_name: string
      impressions: string
      clicks: string
      spend: string
    }>
  }

  const supabase = createAdminClient()
  let upserted = 0

  for (const row of data) {
    const { error } = await supabase.from("analytics_daily").upsert(
      {
        date,
        channel: "meta",
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        impressions: parseInt(row.impressions ?? "0", 10),
        clicks: parseInt(row.clicks ?? "0", 10),
        spend: parseFloat(row.spend ?? "0"),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "date,channel,campaign_id" }
    )

    if (error) {
      console.error(`[sync-meta] upsert failed for campaign ${row.campaign_id}`, error.message)
    } else {
      upserted++
    }
  }

  const totals = data.reduce(
    (acc, row) => ({
      impressions: acc.impressions + parseInt(row.impressions ?? "0", 10),
      clicks: acc.clicks + parseInt(row.clicks ?? "0", 10),
      spend: acc.spend + parseFloat(row.spend ?? "0"),
    }),
    { impressions: 0, clicks: 0, spend: 0 }
  )

  await supabase.from("analytics_daily").upsert(
    {
      date,
      channel: "meta",
      campaign_id: "__total__",
      campaign_name: "All Meta Campaigns",
      ...totals,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "date,channel,campaign_id" }
  )

  return NextResponse.json({ ok: true, date, campaigns: data.length, upserted })
}
