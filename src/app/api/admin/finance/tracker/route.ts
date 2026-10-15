import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"
import { logAdminAction } from "@/lib/admin-audit"
import { rebuildFinanceTrackerFromAdmin } from "@/lib/finance/rebuild-finance-tracker"
import { runMonthlyReconciliation } from "@/lib/finance/monthly-reconciliation"
import { backfillPlatformData, restructureTracker } from "@/lib/finance/tracker-maintenance"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const MONTH_RE = /^\d{4}-\d{2}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function monthsBetween(from: string, to: string) {
  const out: string[] = []
  let [y, m] = from.split("-").map(Number)
  const [ty, tm] = to.split("-").map(Number)
  while (y * 100 + m <= ty * 100 + tm && out.length < 36) {
    out.push(`${y}-${String(m).padStart(2, "0")}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

/**
 * Admin Finance Tracker maintenance. Body:
 *   { action: "restructure" }
 *   { action: "backfill-platform", from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
 *   { action: "rebuild-summary" }
 *   { action: "closes", from: "YYYY-MM", to: "YYYY-MM" }
 */
export async function POST(req: NextRequest) {
  const { error, admin, user } = await requireAdminApi()
  if (error || !admin || !user) return error
  const body = (await req.json().catch(() => ({}))) as { action?: string; from?: string; to?: string }

  try {
    if (body.action === "restructure") {
      const result = await restructureTracker(admin)
      await logAdminAction(admin, { adminId: user.id, action: "settings_update", targetType: "finance_tracker", targetId: result.spreadsheetId, details: { maintenance: "restructure", report: result.report } })
      return NextResponse.json({ ok: true, ...result })
    }
    if (body.action === "backfill-platform") {
      if (!DATE_RE.test(body.from ?? "") || !DATE_RE.test(body.to ?? "")) return NextResponse.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 })
      return NextResponse.json({ ok: true, ...(await backfillPlatformData(admin, body.from!, body.to!)) })
    }
    if (body.action === "rebuild-summary") {
      return NextResponse.json({ ok: true, ...(await rebuildFinanceTrackerFromAdmin(admin)) })
    }
    if (body.action === "closes") {
      if (!MONTH_RE.test(body.from ?? "") || !MONTH_RE.test(body.to ?? "")) return NextResponse.json({ error: "from/to must be YYYY-MM" }, { status: 400 })
      const results = []
      for (const month of monthsBetween(body.from!, body.to!)) {
        const { result, sheet } = await runMonthlyReconciliation(admin, month)
        results.push({ month, tab: sheet.tab, out: result.costs.total + result.stripe.stripeFeesUsd, revenue: result.bottomLine.revenue })
      }
      return NextResponse.json({ ok: true, results })
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
