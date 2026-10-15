import { NextRequest, NextResponse } from "next/server"

import { createGoogleSheetsClient, getNamerSheetId } from "@/lib/agent/google-sheets-client"
import { runNamerSync } from "@/lib/agent/namer-sync"
import { logAdminAction } from "@/lib/admin-audit"
import { requireAdminApi } from "@/lib/admin-guard"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * Admin-only maintenance tool for the thrml namer sheet (and only that sheet).
 * Body:
 *  { action: "meta" }                                         → tabs (id, title, hidden, size)
 *  { action: "read", ranges: string[], formulas?: boolean }   → values (or formulas)
 *  { action: "write", data: {range, values}[], raw?: boolean } → values.batchUpdate (USER_ENTERED by default)
 *  { action: "batchUpdate", requests: object[] }              → spreadsheets.batchUpdate (tab add/delete/hide…)
 *  { action: "sync" }                                         → run namer-sync now
 */
export async function POST(req: NextRequest) {
  const { error, admin, user } = await requireAdminApi()
  if (error || !admin) return error
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action = String(body.action ?? "")

  try {
    const spreadsheetId = getNamerSheetId()
    const sheets = createGoogleSheetsClient()

    if (action === "meta") {
      const res = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties(sheetId,title,index,hidden,gridProperties(rowCount,columnCount))",
      })
      return NextResponse.json({ ok: true, sheets: (res.data.sheets ?? []).map((s) => s.properties) })
    }

    if (action === "read") {
      const ranges = Array.isArray(body.ranges) ? body.ranges.map(String).slice(0, 40) : []
      if (!ranges.length) return NextResponse.json({ ok: false, error: "ranges required" }, { status: 400 })
      const res = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
        valueRenderOption: body.formulas ? "FORMULA" : "FORMATTED_VALUE",
      })
      return NextResponse.json({ ok: true, valueRanges: res.data.valueRanges ?? [] })
    }

    if (action === "write" || action === "batchUpdate") {
      if (action === "write") {
        const data = Array.isArray(body.data) ? (body.data as { range: string; values: unknown[][] }[]) : []
        if (!data.length) return NextResponse.json({ ok: false, error: "data required" }, { status: 400 })
        const res = await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { valueInputOption: body.raw ? "RAW" : "USER_ENTERED", data },
        })
        await logAdminAction(admin, {
          adminId: user?.id ?? null,
          action: "namer_sheet.write",
          targetType: "google_sheet",
          targetId: spreadsheetId,
          details: { ranges: data.map((d) => d.range) },
        })
        return NextResponse.json({ ok: true, updatedCells: res.data.totalUpdatedCells ?? 0 })
      }
      const requests = Array.isArray(body.requests) ? (body.requests as object[]) : []
      if (!requests.length) return NextResponse.json({ ok: false, error: "requests required" }, { status: 400 })
      const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
      await logAdminAction(admin, {
        adminId: user?.id ?? null,
        action: "namer_sheet.batch_update",
        targetType: "google_sheet",
        targetId: spreadsheetId,
        details: { kinds: requests.map((r) => Object.keys(r)[0]) },
      })
      return NextResponse.json({ ok: true, replies: res.data.replies ?? [] })
    }

    if (action === "sync") {
      const result = await runNamerSync(admin)
      return NextResponse.json(result)
    }

    return NextResponse.json({ ok: false, error: `unknown action "${action}"` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
