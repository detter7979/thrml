import { NextResponse } from "next/server"

import { runEvaluator } from "@/lib/agent/evaluator"
import { requireAdminApi } from "@/lib/admin-guard"

export const maxDuration = 60

export async function POST() {
  const { error } = await requireAdminApi()
  if (error) return error

  try {
    const result = await runEvaluator({ dryRun: true })
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error, runId: result.runId }, { status: 500 })
    }
    return NextResponse.json({
      ok: true,
      runId: result.runId,
      proposals_raw: result.proposalsRaw,
      proposals_after_dedupe: result.proposalsAfterDedupe,
      proposals_written: result.proposalsWritten,
      duration_ms: result.duration_ms,
      proposals: result.proposals,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
