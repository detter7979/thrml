import { NextRequest, NextResponse } from "next/server"

import { runMetaAdsAgent } from "@/lib/agent/meta-ads-agent"
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
    const result = await runMetaAdsAgent(admin, {})
    if (!result.ok) {
      console.error("[meta-ads-agent]", result.error)
      return NextResponse.json(
        { ...result, ok: false, error: result.error },
        { status: 500 },
      )
    }
    return NextResponse.json({
      ok: true,
      runId: result.runId,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      dry_run: result.dry_run,
      duration_ms: result.duration_ms,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    console.error("[meta-ads-agent]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
