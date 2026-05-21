import { NextRequest, NextResponse } from "next/server"

import { runNamerSync } from "@/lib/agent/namer-sync"
import { createAdminClient } from "@/lib/supabase/admin"

export const maxDuration = 120

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

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "GOOGLE_SERVICE_ACCOUNT_JSON not set",
    })
  }

  if (!process.env.NAMER_SHEET_ID?.trim()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "NAMER_SHEET_ID not set",
    })
  }

  try {
    const admin = createAdminClient()
    const result = await runNamerSync(admin)

    return NextResponse.json(
      {
        ok: result.ok,
        runId: result.runId,
        error: result.error,
        rows_ingested: undefined,
        campaigns_processed: result.campaigns_processed,
        campaigns_skipped: result.campaigns_skipped,
        ad_sets_processed: result.ad_sets_processed,
        ad_sets_skipped: result.ad_sets_skipped,
        ads_processed: result.ads_processed,
        ads_skipped: result.ads_skipped,
        sheet_cells_updated: result.sheet_cells_updated,
        awaiting_meta_build: result.awaiting_meta_build,
        unmatched_written: result.unmatched_written,
        changes_count: result.changes.length,
        duration_ms: result.duration_ms,
        ...(result.reason ? { reason: result.reason } : {}),
      },
      { status: 200 }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    console.error("[namer-sync]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 200 })
  }
}
