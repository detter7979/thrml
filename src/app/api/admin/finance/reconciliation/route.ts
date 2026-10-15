import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"
import { previousMonth } from "@/lib/finance/monthly-reconciliation"
import { runReconciliationJob } from "@/lib/finance/run-reconciliation-job"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/** Admin: build (or rebuild) a month's reconciliation now. Body: { month?: "YYYY-MM", email?: boolean } */
export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const body = (await req.json().catch(() => ({}))) as { month?: unknown; email?: unknown }
  const month = typeof body.month === "string" && /^\d{4}-\d{2}$/.test(body.month) ? body.month : previousMonth()
  const result = await runReconciliationJob(admin, month, { email: body.email === true })
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
