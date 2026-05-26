import { NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"
import { listStatementFiles } from "@/lib/finance/statement-import"

export const dynamic = "force-dynamic"

export async function GET() {
  const { error } = await requireAdminApi()
  if (error) return error

  const result = listStatementFiles()
  return NextResponse.json({
    ...result,
    instructions:
      "Drop bank/credit-card CSV exports here. Future runs will map transactions into Fixed Costs and Ad Hoc Costs on the Finance Tracker.",
  })
}
