import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"
import { buildUnified, lookupToValues, toCsv, unifiedToValues, utcDaysAgo } from "@/lib/reporting/unified"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Admin: unified rows for any date range (the database keeps full history, Drive only 45 days).
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD&test=1&format=csv|json&tab=cleaned|lookup|ga4
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAdminApi()
  if (error) return error
  const q = req.nextUrl.searchParams
  const from = DATE.test(q.get("from") ?? "") ? q.get("from")! : utcDaysAgo(45)
  const to = DATE.test(q.get("to") ?? "") ? q.get("to")! : utcDaysAgo(0)
  const test = q.get("test") === "1"
  const tab = q.get("tab") ?? "cleaned"

  const built = await buildUnified(createAdminClient(), { from, to, test })

  if (q.get("format") === "csv") {
    const values =
      tab === "ga4" ? built.ga4Rows : tab === "lookup" ? lookupToValues(built.lookup) : unifiedToValues(built.rows)
    const name = `thrml_${tab}${test ? "_TEST" : ""}_${from}_${to}.csv`
    return new NextResponse(toCsv(values), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    })
  }
  return NextResponse.json({ from, to, test, rows: built.rows })
}
