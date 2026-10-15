import { NextRequest, NextResponse } from "next/server"

import { previousMonth } from "@/lib/finance/monthly-reconciliation"
import { runReconciliationJob } from "@/lib/finance/run-reconciliation-job"
import { createAdminClient } from "@/lib/supabase/admin"

export const maxDuration = 120

function cronAuth(req: NextRequest) {
  return req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "") ?? null
}

/** Runs on the 1st of each month for the previous month (vercel.json). */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return NextResponse.json({ ok: true, skipped: true, reason: "GOOGLE_SERVICE_ACCOUNT_JSON not set" })
  }
  const result = await runReconciliationJob(createAdminClient(), previousMonth(), { email: true })
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
