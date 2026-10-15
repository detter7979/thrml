import { NextRequest, NextResponse } from "next/server"

import { syncMetaStatuses } from "@/lib/agent/meta-status-sync"
import { requireAdminApi } from "@/lib/admin-guard"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Admin: compare campaign / ad set / ad statuses with Meta. Body: { dryRun?: boolean } (default true). */
export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error
  const body = (await req.json().catch(() => ({}))) as { dryRun?: unknown }
  try {
    const result = await syncMetaStatuses(admin, { dryRun: body.dryRun !== false })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
