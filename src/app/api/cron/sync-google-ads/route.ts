import { NextRequest, NextResponse } from "next/server"

import { fetchGoogleInsights } from "@/lib/agent/google-ads-api"
import { createAdminClient } from "@/lib/supabase/admin"

export const maxDuration = 60

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

/** Google Ads spend / impressions / clicks per campaign → analytics_daily (channel google_ads), like sync-meta. */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const date = req.nextUrl.searchParams.get("date") ?? yesterday()

  let rows: Awaited<ReturnType<typeof fetchGoogleInsights>>
  try {
    rows = await fetchGoogleInsights(date)
  } catch (e) {
    // Missing Google Ads API credentials etc. — report, don't fail the cron.
    const msg = e instanceof Error ? e.message : String(e)
    console.warn("[sync-google-ads] skipped:", msg)
    return NextResponse.json({ ok: true, date, upserted: 0, skipped: msg })
  }

  const byCampaign = new Map<string, { name: string; impressions: number; clicks: number; spend: number }>()
  for (const r of rows) {
    if (!r.campaign_id) continue
    const c = byCampaign.get(r.campaign_id) ?? { name: r.campaign_name, impressions: 0, clicks: 0, spend: 0 }
    c.impressions += r.impressions
    c.clicks += r.clicks
    c.spend += r.spend
    byCampaign.set(r.campaign_id, c)
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()
  let upserted = 0
  for (const [campaignId, c] of byCampaign) {
    const { error } = await supabase.from("analytics_daily").upsert(
      {
        date,
        channel: "google_ads",
        campaign_id: campaignId,
        campaign_name: c.name,
        impressions: c.impressions,
        clicks: c.clicks,
        spend: Math.round(c.spend * 100) / 100,
        updated_at: now,
      },
      { onConflict: "date,channel,campaign_id" }
    )
    if (error) console.error(`[sync-google-ads] upsert failed for ${campaignId}`, error.message)
    else upserted++
  }

  return NextResponse.json({ ok: true, date, campaigns: byCampaign.size, upserted })
}
