import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

export type DisputeDecisionRow = {
  id: string
  support_request_id: string
  ticket_number?: string | null
  booking_id?: string | null
  booking_status?: string | null
  total_charged?: number | string | null
  session_date?: string | null
  hours_until_session?: number | string | null
  cancellation_policy?: string | null
  dispute_category?: string | null
  confidence?: string | null
  classification_reasoning?: string | null
  recommended_action?: string | null
  refund_amount?: number | string | null
  refund_pct?: number | string | null
  host_penalty_pct?: number | string | null
  requires_human_review?: boolean | null
  human_review_reason?: string | null
  claude_raw_response?: string | null
  action_taken?: string | null
  action_executed?: boolean | null
  execution_error?: string | null
  stripe_refund_id?: string | null
  created_at?: string | null
  overridden_by_human?: string | null
  override_note?: string | null
}

function isMissingColumnError(message: string) {
  const normalized = message.toLowerCase()
  return (
    (normalized.includes("column") && normalized.includes("does not exist")) ||
    (normalized.includes("could not find") &&
      normalized.includes("column") &&
      normalized.includes("schema cache"))
  )
}

function latestDecisionBySupportId(rows: DisputeDecisionRow[]) {
  const map = new Map<string, DisputeDecisionRow>()
  for (const row of rows) {
    const sid = row.support_request_id
    if (!sid) continue
    const existing = map.get(sid)
    if (!existing) {
      map.set(sid, row)
      continue
    }
    const a = existing.created_at ?? ""
    const b = row.created_at ?? ""
    if (b > a) map.set(sid, row)
  }
  return map
}

export async function GET(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")?.trim() || null
  const disputeCategory = searchParams.get("dispute_category")?.trim() || null
  const search = searchParams.get("search")?.trim() || null
  const from = searchParams.get("from")?.trim() || null
  const to = searchParams.get("to")?.trim() || null
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50) || 50))
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0)

  const sanitizedSearch =
    search && search.length <= 120 ? search.replace(/[%,]/g, " ").trim() : null

  let q = admin.from("support_requests").select("*", { count: "exact" })
  if (status) q = q.eq("status", status)
  if (disputeCategory) q = q.eq("dispute_type", disputeCategory)
  if (from) q = q.gte("created_at", from)
  if (to) q = q.lte("created_at", to)
  if (sanitizedSearch) {
    const s = sanitizedSearch
    q = q.or(`ticket_number.ilike.%${s}%,subject.ilike.%${s}%,email.ilike.%${s}%,name.ilike.%${s}%`)
  }

  const listRes = await q.order("created_at", { ascending: false }).range(offset, offset + limit - 1)

  if (listRes.error) {
    return NextResponse.json({ error: listRes.error.message }, { status: 500 })
  }

  const tickets = (listRes.data ?? []) as Record<string, unknown>[]
  const total = listRes.count ?? tickets.length

  const ids = (tickets ?? []).map((t) => t.id as string).filter(Boolean)
  let decisions: DisputeDecisionRow[] = []
  if (ids.length > 0) {
    const decRes = await admin
      .from("dispute_decisions")
      .select("*")
      .in("support_request_id", ids)
      .order("created_at", { ascending: false })

    if (decRes.error && !isMissingColumnError(decRes.error.message)) {
      return NextResponse.json({ error: decRes.error.message }, { status: 500 })
    }
    decisions = (decRes.data ?? []) as DisputeDecisionRow[]
  }

  const latestMap = latestDecisionBySupportId(decisions)

  const merged = (tickets ?? []).map((t) => ({
    ...t,
    latest_decision: latestMap.get(t.id as string) ?? null,
  }))

  return NextResponse.json({ tickets: merged, total: total ?? merged.length })
}
