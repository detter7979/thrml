import { NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"
import { syncMarketplaceFinanceSheet } from "@/lib/finance/sync-marketplace-sheet"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST() {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return NextResponse.json(
      { error: "GOOGLE_SERVICE_ACCOUNT_JSON is not configured" },
      { status: 503 }
    )
  }

  const result = await syncMarketplaceFinanceSheet(admin)
  return NextResponse.json({
    ok: true,
    rows: result.rows,
    spreadsheetId: result.spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${result.spreadsheetId}`,
  })
}
