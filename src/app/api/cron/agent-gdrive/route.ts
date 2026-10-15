import { NextRequest, NextResponse } from "next/server"

import { syncMarketplaceFinanceSheet } from "@/lib/finance/sync-marketplace-sheet"
import { createAdminClient } from "@/lib/supabase/admin"

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
    return NextResponse.json({ ok: true, skipped: true, reason: "GOOGLE_SERVICE_ACCOUNT_JSON not set" })
  }

  const admin = createAdminClient()
  const runStart = Date.now()
  const { data: runRow } = await admin
    .from("agent_runs").insert({ agent_name: "gdrive-sync", status: "running" }).select("id").single()
  const runId = runRow?.id ?? null

  try {
    // The Finance Tracker's "Marketplace Data" tab is the single destination for daily
    // marketplace numbers. (The old "Sheet1" write failed: the tracker has no Sheet1 tab,
    // and it duplicated the same rows.)
    const { data: trackerSetting } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "gdrive_finance_tracker_sheet_id")
      .maybeSingle()
    const trackerSheetId = trackerSetting?.value
      ? String(trackerSetting.value).replace(/^"|"$/g, "")
      : undefined
    const trackerSync = await syncMarketplaceFinanceSheet(admin, trackerSheetId)
    const results = { rows: trackerSync.rows, spreadsheetId: trackerSync.spreadsheetId, tab: "Marketplace Data" }
    if (runId) await admin.from("agent_runs").update({
      status: "success", completed_at: new Date().toISOString(),
      duration_ms: Date.now() - runStart, results,
    }).eq("id", runId)

    return NextResponse.json({ ok: true, ...results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (runId) await admin.from("agent_runs").update({
      status: "error", completed_at: new Date().toISOString(),
      duration_ms: Date.now() - runStart, error_message: msg,
    }).eq("id", runId)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
