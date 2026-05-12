import { NextRequest, NextResponse } from "next/server"

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
      duration_ms: result.duration_ms,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    console.error("[reporting-agent]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
