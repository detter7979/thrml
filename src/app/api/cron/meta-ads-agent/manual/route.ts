import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

import { runMetaAdsAgent } from "@/lib/agent/meta-ads-agent"
import { requireAdminApi } from "@/lib/admin-guard"

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as { dryRun?: boolean } | null
  const dryRun = body?.dryRun === true

  try {
    const result = await runMetaAdsAgent(admin!, { dryRun })
    revalidatePath("/admin/paid-media/executions")
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, runId: result.runId, ...result },
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
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
