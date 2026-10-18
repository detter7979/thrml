import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"
import { buildMonthlyReconciliation } from "@/lib/finance/monthly-reconciliation"
import { fakeMonth, fssStatementsId, loadMonthDetail, writeMonthStatement } from "@/lib/finance/year-statements"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Admin: write monthly statements to the FSS year workbook.
 * Body: { months: ["2026-09", ...], test?: boolean }. test=true writes fake bookings/expenses to the TEST workbook.
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAdminApi()
  if (error) return error
  const body = (await req.json().catch(() => ({}))) as { months?: string[]; test?: boolean }
  const months = (body.months ?? []).filter((m) => /^\d{4}-\d{2}$/.test(m))
  if (!months.length) return NextResponse.json({ ok: false, error: "months required (YYYY-MM)" }, { status: 400 })
  const admin = createAdminClient()
  const out: Record<string, unknown>[] = []
  for (const month of months) {
    try {
      const id = await fssStatementsId(admin, month.slice(0, 4), Boolean(body.test))
      if (!id) throw new Error(`No FSS ${body.test ? "TEST " : ""}workbook for ${month.slice(0, 4)}`)
      const { result, detail } = body.test
        ? fakeMonth(month)
        : { result: await buildMonthlyReconciliation(admin, month), detail: await loadMonthDetail(admin, month) }
      const written = await writeMonthStatement(id, result, detail, { test: Boolean(body.test) })
      out.push({ month, ok: true, ...written, net: result.bottomLine.net, bookings: detail.bookings.length })
    } catch (e) {
      out.push({ month, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return NextResponse.json({ ok: out.every((o) => o.ok), results: out })
}
