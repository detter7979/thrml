import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"
import { clearTestData, runTestScenario } from "@/lib/reporting/test-scenario"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Admin: { action: "run", sendToApprovals?: boolean } or { action: "clear" }. Never touches Meta. */
export async function POST(req: NextRequest) {
  const { error } = await requireAdminApi()
  if (error) return error
  const body = (await req.json().catch(() => ({}))) as { action?: string; sendToApprovals?: boolean; writeReport?: boolean }
  const admin = createAdminClient()
  try {
    if (body.action === "clear") return NextResponse.json({ ok: true, ...(await clearTestData(admin)) })
    const result = await runTestScenario(admin, {
      sendToApprovals: Boolean(body.sendToApprovals),
      writeReport: body.writeReport !== false,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
