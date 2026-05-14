import { NextRequest, NextResponse } from "next/server"

import { runEvaluator } from "@/lib/agent/evaluator"

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
    const result = await runEvaluator({ dryRun: false })
    if (!result.ok) {
      console.error("[evaluator-agent]", result.error)
      return NextResponse.json({ ok: false, error: result.error, runId: result.runId }, { status: 500 })
    }
    return NextResponse.json({
      ok: true,
      runId: result.runId,
      proposals_raw: result.proposalsRaw,
      proposals_after_dedupe: result.proposalsAfterDedupe,
      proposals_written: result.proposalsWritten,
      duration_ms: result.duration_ms,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    console.error("[evaluator-agent]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
