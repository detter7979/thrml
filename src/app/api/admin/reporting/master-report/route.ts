import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"
import { buildMasterReport } from "@/lib/reporting/master-report"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Admin: rebuild the Master Report now. Body: { test?: boolean, rebuildPivots?: boolean, removeLegacyTabs?: boolean }.
 * rebuildPivots replaces the pivot tabs with the defaults (your pivot edits are lost);
 * removeLegacyTabs deletes the April-test tabs (Performance Report, Platform Data, …).
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAdminApi()
  if (error) return error
  const body = (await req.json().catch(() => ({}))) as { test?: boolean; rebuildPivots?: boolean; removeLegacyTabs?: boolean }
  const admin = createAdminClient()
  const key = body.test ? "gdrive_test_master_report_id" : "gdrive_paid_media_master_report_id"
  const { data } = await admin.from("platform_settings").select("value").eq("key", key).maybeSingle()
  const spreadsheetId = data?.value ? String(data.value).replace(/^"|"$/g, "") : null
  if (!spreadsheetId) return NextResponse.json({ ok: false, error: `${key} not set` }, { status: 400 })
  try {
    const result = await buildMasterReport(admin, {
      test: Boolean(body.test),
      spreadsheetId,
      rebuildPivots: Boolean(body.rebuildPivots),
      removeLegacyTabs: Boolean(body.removeLegacyTabs),
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
