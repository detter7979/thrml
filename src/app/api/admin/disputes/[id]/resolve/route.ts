import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"
import type { BookingContext, RecommendedAction } from "@/lib/disputes/classifier"
import { executeResolution } from "@/lib/disputes/executor"
import {
  applyOverrideToClassification,
  classificationFromDecisionRow,
  type DecisionLike,
} from "@/lib/disputes/from-decision"

const ACTIONS = new Set<RecommendedAction>([
  "full_refund",
  "partial_refund",
  "no_refund",
  "host_penalty",
  "flag_for_human",
  "send_info",
  "no_action",
])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, admin, user } = await requireAdminApi()
  if (error || !admin || !user) return error

  const { id: supportRequestId } = await params
  if (!supportRequestId) {
    return NextResponse.json({ error: "Missing ticket id" }, { status: 400 })
  }

  let body: {
    action?: string
    override_action?: string
    note?: string
    refund_pct?: number
    refund_amount?: number
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const action = body.action
  if (action !== "approve" && action !== "override" && action !== "reject") {
    return NextResponse.json({ error: "action must be approve, override, or reject" }, { status: 400 })
  }

  const { data: ticket, error: ticketErr } = await admin
    .from("support_requests")
    .select("*")
    .eq("id", supportRequestId)
    .maybeSingle()

  if (ticketErr) {
    return NextResponse.json({ error: ticketErr.message }, { status: 500 })
  }
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  const { data: decisions, error: decErr } = await admin
    .from("dispute_decisions")
    .select("*")
    .eq("support_request_id", supportRequestId)
    .order("created_at", { ascending: false })
    .limit(1)

  if (decErr) {
    return NextResponse.json({ error: decErr.message }, { status: 500 })
  }

  const latest = decisions?.[0] as Record<string, unknown> | undefined
  const note = typeof body.note === "string" ? body.note : null

  if (action === "reject") {
    const updTicket = await admin
      .from("support_requests")
      .update({
        status: "closed",
        resolution_source: "human_rejected",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", supportRequestId)

    if (updTicket.error) {
      return NextResponse.json({ error: updTicket.error.message }, { status: 500 })
    }

    if (latest?.id) {
      const { error: decUpdErr } = await admin
        .from("dispute_decisions")
        .update({
          action_taken: "human_rejected",
          action_executed: false,
          execution_error: null,
          overridden_by_human: user.id,
          override_note: note,
        })
        .eq("id", latest.id as string)
      if (decUpdErr) {
        console.error("[admin/disputes/resolve] decision update on reject", decUpdErr.message)
      }
    }

    return NextResponse.json({ ok: true, action: "reject" })
  }

  if (!latest) {
    return NextResponse.json(
      { error: "No dispute decision found for this ticket — run the agent first." },
      { status: 400 }
    )
  }

  const ticketName = typeof ticket.name === "string" ? ticket.name : "Guest"
  const ticketNumber =
    typeof ticket.ticket_number === "string" && ticket.ticket_number
      ? ticket.ticket_number
      : String(ticket.id)
  const userEmail = typeof ticket.email === "string" ? ticket.email : ""
  const bookingId = (ticket.booking_id as string | null) ?? (latest.booking_id as string | null)

  let totalCharged = Number(latest.total_charged ?? 0)
  if (bookingId) {
    const { data: bookingRow } = await admin
      .from("bookings")
      .select("total_charged")
      .eq("id", bookingId)
      .maybeSingle()
    if (bookingRow && bookingRow.total_charged != null) {
      totalCharged = Number(bookingRow.total_charged)
    }
  }

  let classification = classificationFromDecisionRow(latest as DecisionLike, { name: ticketName })

  if (action === "override") {
    const overrideAction = body.override_action as RecommendedAction | undefined
    if (!overrideAction || !ACTIONS.has(overrideAction)) {
      return NextResponse.json({ error: "override_action is required for override" }, { status: 400 })
    }
    classification = applyOverrideToClassification(
      classification,
      {
        recommended_action: overrideAction,
        refund_pct: body.refund_pct,
        refund_amount: body.refund_amount,
      },
      totalCharged
    )

    await admin
      .from("dispute_decisions")
      .update({
        recommended_action: classification.recommended_action,
        refund_pct: classification.refund_pct,
        refund_amount: classification.refund_amount,
        host_penalty_pct: classification.host_penalty_pct,
        overridden_by_human: user.id,
        override_note: note,
      })
      .eq("id", latest.id as string)
  } else {
    await admin
      .from("dispute_decisions")
      .update({
        overridden_by_human: user.id,
        override_note: note,
      })
      .eq("id", latest.id as string)
  }

  const bookingContext: BookingContext = {
    booking_id: bookingId,
    booking_status: (latest.booking_status as string | null) ?? null,
    total_charged: totalCharged,
    session_date: (latest.session_date as string | null) ?? null,
    start_time: null,
    hours_until_session:
      latest.hours_until_session != null ? Number(latest.hours_until_session) : null,
    cancellation_policy: (latest.cancellation_policy as string | null) ?? null,
    guest_dispute_count: 0,
    host_dispute_count: 0,
    host_cancellation_count: 0,
    has_safety_mention: false,
  }

  const execution = await executeResolution(
    supportRequestId,
    ticketNumber,
    bookingContext,
    classification,
    userEmail,
    ticketName,
    { bypassAutoGate: true }
  )

  await admin
    .from("dispute_decisions")
    .update({
      action_taken: execution.action_taken,
      action_executed: execution.action_executed,
      execution_error: execution.execution_error,
      stripe_refund_id: execution.stripe_refund_id,
    })
    .eq("id", latest.id as string)

  return NextResponse.json({ ok: true, action, execution })
}
