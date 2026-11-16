import { NextRequest, NextResponse } from "next/server"

import { googleAdsConfigured } from "@/lib/agent/google-ads-api"
import { syncGoogleListingFeed } from "@/lib/feeds/google-custom-feed-sync"
import { createAdminClient } from "@/lib/supabase/admin"

export const maxDuration = 60

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("cron_secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

/**
 * Daily: keep the Google Ads custom feed (dynamic remarketing) in step with live listings.
 * `?dry=1` reports what would change without touching Google Ads.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!googleAdsConfigured()) {
    return NextResponse.json({ ok: true, skipped: "Google Ads API not configured" })
  }

  const dryRun = req.nextUrl.searchParams.get("dry") === "1"
  try {
    const result = await syncGoogleListingFeed(createAdminClient(), { dryRun })
    if (result.errors.length) console.warn("[sync-google-listing-feed] partial failures", result.errors)
    return NextResponse.json({ ok: result.errors.length === 0, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[sync-google-listing-feed] failed:", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
