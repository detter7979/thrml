import { NextRequest, NextResponse } from "next/server"

import { syncMetaStatuses } from "@/lib/agent/meta-status-sync"
import { runReportingIngest } from "@/lib/agent/reporting-agent-ingest"
import { utcYesterdayRange } from "@/lib/dates/utc-yesterday"
import { createAdminClient } from "@/lib/supabase/admin"

export const maxDuration = 60

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    // Ads are created PAUSED and switched on in Ads Manager. Mirror Meta's statuses first so a
    // campaign or ad turned on yesterday is ingested today, not a day late.
    try {
      await syncMetaStatuses(admin)
    } catch (e) {
      console.error("[reporting-agent] meta status sync failed", e instanceof Error ? e.message : e)
    }
    const { dateStart, dateEnd } = utcYesterdayRange()
    const result = await runReportingIngest(admin, { dateStart, dateEnd })
    if (!result.ok) {
      console.error("[reporting-agent]", result.error)
      return NextResponse.json({ ok: false, error: result.error, runId: result.runId }, { status: 500 })
    }
    return NextResponse.json({
      ok: true,
      runId: result.runId,
      partial: result.partial,
      rows_ingested: result.rows_ingested,
      campaigns_processed: result.campaigns_processed,
      campaigns_skipped: result.campaigns_skipped,
      ad_sets_processed: result.ad_sets_processed,
      ads_processed: result.ads_processed,
      duration_ms: result.duration_ms,
      ...(result.reason ? { reason: result.reason } : {}),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    console.error("[reporting-agent]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
