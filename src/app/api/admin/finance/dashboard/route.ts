import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"
import { buildFinanceDashboard } from "@/lib/finance/dashboard-metrics"
import type { FinancePeriod } from "@/lib/finance/period-utils"

export const dynamic = "force-dynamic"

const PERIODS = new Set<FinancePeriod>(["7d", "mtd", "30d", "90d", "ytd"])

export async function GET(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const periodParam = req.nextUrl.searchParams.get("period") ?? "mtd"
  const period = PERIODS.has(periodParam as FinancePeriod)
    ? (periodParam as FinancePeriod)
    : "mtd"
  const skipSheets = req.nextUrl.searchParams.get("skipSheets") === "1"

  const payload = await buildFinanceDashboard(admin, period, {
    includeSheetCosts: !skipSheets,
  })

  return NextResponse.json(payload)
}
