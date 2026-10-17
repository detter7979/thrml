import { NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"
import { runUnifiedReport } from "@/lib/reporting/run-report"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Admin: run the nightly unified report now (pull 45 days, rewrite Drive files and Platform Data). */
export async function POST() {
  const { error } = await requireAdminApi()
  if (error) return error
  try {
    const result = await runUnifiedReport(createAdminClient())
    return NextResponse.json(result, { status: result.ok ? 200 : 207 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
