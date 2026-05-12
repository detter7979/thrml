import { NextRequest, NextResponse } from "next/server"

import { runReportingIngest } from "@/lib/agent/reporting-agent-ingest"
import { utcYesterdayRange } from "@/lib/dates/utc-yesterday"
import { requireAdminApi } from "@/lib/admin-guard"
import { createAdminClient } from "@/lib/supabase/admin"

export const maxDuration = 60

function parseDate(s: unknown): string | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdminApi()
  if (error) return error

  let body: { dateStart?: unknown; dateEnd?: unknown } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }

  const y = utcYesterdayRange()
  const dateStart = parseDate(body.dateStart) ?? y.dateStart
  const dateEnd = parseDate(body.dateEnd) ?? y.dateEnd
  if (dateStart > dateEnd) {
    return NextResponse.json({ ok: false, error: "dateStart must be <= dateEnd" }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const result = await runReportingIngest(admin, { dateStart, dateEnd, freshRun: true })
    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
