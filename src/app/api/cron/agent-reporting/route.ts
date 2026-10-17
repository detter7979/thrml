import { NextRequest, NextResponse } from "next/server"

import { runUnifiedReport } from "@/lib/reporting/run-report"
import { createAdminClient } from "@/lib/supabase/admin"

// 45 days × Meta + Google + GA4, then four sheet rewrites.
export const maxDuration = 300

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

/**
 * Nightly unified paid media report (see src/lib/reporting/run-report.ts): Raw + Cleaned files in
 * Drive, the Finance Tracker's Platform Data tab, and the report tables behind admin › Paid media.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const admin = createAdminClient()
  const runStart = Date.now()
  const { data: runRow } = await admin.from("agent_runs").insert({ agent_name: "reporting", status: "running" }).select("id").single()
  const runId = runRow?.id ?? null

  try {
    const result = await runUnifiedReport(admin)
    if (runId) {
      await admin
        .from("agent_runs")
        .update({
          status: result.ok ? "success" : "error",
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - runStart,
          results: result,
          error_message: result.ok ? null : result.errors.join(" | ").slice(0, 1000),
        })
        .eq("id", runId)
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 207 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (runId) {
      await admin
        .from("agent_runs")
        .update({ status: "error", completed_at: new Date().toISOString(), duration_ms: Date.now() - runStart, error_message: msg })
        .eq("id", runId)
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
