import { NextRequest, NextResponse } from "next/server"

import { classifyDispute, type BookingContext } from "@/lib/disputes/classifier"
import { executeResolution } from "@/lib/disputes/executor"
import { hoursUntilSession, parseSessionStart } from "@/lib/cancellations"
import { createAdminClient } from "@/lib/supabase/admin"

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const results = { evaluated: 0, auto_resolved: 0, flagged_human: 0, errors: 0 }

  const { data: policyRow } = await supabase
    .from("agent_policies")
    .select("content")
    .eq("policy_key", "dispute_resolution_v1")
    .eq("is_active", true)
    .maybeSingle()
  const policyText = policyRow?.content ?? "No policy found — flag all for human review."

  const { data: tickets } = await supabase
    .from("support_requests")
    .select("*")
    .eq("status", "open")
    .is("agent_run_at", null)
    .order("created_at", { ascending: true })
    .limit(20)

  if (!tickets?.length) {
    return NextResponse.json({ ok: true, message: "No open tickets to process", ...results })
  }

  for (const ticket of tickets) {
    try {
      results.evaluated++

      await supabase
        .from("support_requests")
        .update({ status: "pending_agent", agent_run_at: new Date().toISOString() })
        .eq("id", ticket.id)

      let bookingContext: BookingContext = {
        booking_id: ticket.booking_id ?? null,
        booking_status: null,
        total_charged: 0,
        session_date: null,
        start_time: null,
        hours_until_session: null,
        cancellation_policy: null,
        guest_dispute_count: 0,
        host_dispute_count: 0,
        host_cancellation_count: 0,
        has_safety_mention: false,
      }

      if (ticket.booking_id) {
        const { data: booking } = await supabase
          .from("bookings")
          .select(
            "id, status, total_charged, session_date, start_time, host_id, guest_id, listings(cancellation_policy)"
          )
          .eq("id", ticket.booking_id)
          .maybeSingle()

        if (booking) {
          const sessionStart = parseSessionStart(booking.session_date, booking.start_time)
          const hoursUntil = sessionStart ? hoursUntilSession(sessionStart) : null

          let guestCount = 0
          if (booking.guest_id) {
            const { count } = await supabase
              .from("support_requests")
              .select("id", { count: "exact", head: true })
              .eq("user_id", booking.guest_id)
              .gte("created_at", new Date(Date.now() - 90 * 86400000).toISOString())
            guestCount = count ?? 0
          }

          const { data: hostBookingRows } = await supabase
            .from("bookings")
            .select("id")
            .eq("host_id", booking.host_id)
            .limit(800)
          const hostBookingIds = (hostBookingRows ?? []).map((r) => r.id).filter(Boolean)
          let hostCount = 0
          if (hostBookingIds.length > 0) {
            const { count } = await supabase
              .from("support_requests")
              .select("id", { count: "exact", head: true })
              .in("booking_id", hostBookingIds)
              .gte("created_at", new Date(Date.now() - 90 * 86400000).toISOString())
            hostCount = count ?? 0
          }

          const { count: hostCancelCount } = await supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("host_id", booking.host_id)
            .eq("status", "cancelled")
            .gte("updated_at", new Date(Date.now() - 30 * 86400000).toISOString())

          const listingsRel = booking.listings as
            | Record<string, unknown>
            | Record<string, unknown>[]
            | null
          const cancellationPolicy = Array.isArray(listingsRel)
            ? ((listingsRel[0] as Record<string, unknown> | undefined)?.cancellation_policy as string | undefined) ??
              null
            : ((listingsRel as Record<string, unknown> | null)?.cancellation_policy as string | undefined) ?? null

          bookingContext = {
            booking_id: booking.id,
            booking_status: booking.status,
            total_charged: Number(booking.total_charged ?? 0),
            session_date: booking.session_date ?? null,
            start_time: booking.start_time ?? null,
            hours_until_session: hoursUntil,
            cancellation_policy: cancellationPolicy,
            guest_dispute_count: guestCount,
            host_dispute_count: hostCount,
            host_cancellation_count: hostCancelCount ?? 0,
            has_safety_mention: false,
          }
        }
      }

      const safetyKeywords = [
        "unsafe",
        "hurt",
        "injured",
        "dangerous",
        "emergency",
        "assault",
        "harassment",
        "threat",
        "scared",
        "safety",
      ]
      bookingContext.has_safety_mention = safetyKeywords.some((k) =>
        (ticket.message as string | null)?.toLowerCase().includes(k)
      )

      const ticketNumberStr =
        typeof ticket.ticket_number === "string" && ticket.ticket_number
          ? ticket.ticket_number
          : String(ticket.id)

      const classification = await classifyDispute(
        {
          subject: ticket.subject ?? "",
          message: ticket.message ?? "",
          name: ticket.name ?? "",
          email: ticket.email ?? "",
          ticket_number: ticketNumberStr,
        },
        bookingContext,
        policyText
      )

      const { data: decisionRow, error: decisionError } = await supabase
        .from("dispute_decisions")
        .insert({
          support_request_id: ticket.id,
          ticket_number: ticket.ticket_number ?? ticketNumberStr,
          booking_id: bookingContext.booking_id,
          booking_status: bookingContext.booking_status,
          total_charged: bookingContext.total_charged,
          session_date: bookingContext.session_date,
          hours_until_session: bookingContext.hours_until_session,
          cancellation_policy: bookingContext.cancellation_policy,
          dispute_category: classification.dispute_category,
          confidence: classification.confidence,
          classification_reasoning: classification.classification_reasoning,
          recommended_action: classification.recommended_action,
          refund_amount: classification.refund_amount,
          refund_pct: classification.refund_pct,
          host_penalty_pct: classification.host_penalty_pct,
          requires_human_review: classification.requires_human_review,
          human_review_reason: classification.human_review_reason,
          claude_raw_response: classification.raw_response,
        })
        .select("id")
        .single()

      if (decisionError) {
        console.error("[agent-disputes] decision insert failed", ticket.id, decisionError.message)
        throw decisionError
      }

      await supabase
        .from("support_requests")
        .update({ dispute_type: classification.dispute_category })
        .eq("id", ticket.id)

      const execution = await executeResolution(
        ticket.id,
        ticketNumberStr,
        bookingContext,
        classification,
        ticket.email ?? "",
        ticket.name ?? ""
      )

      if (decisionRow?.id) {
        await supabase
          .from("dispute_decisions")
          .update({
            action_taken: execution.action_taken,
            action_executed: execution.action_executed,
            execution_error: execution.execution_error,
            stripe_refund_id: execution.stripe_refund_id,
          })
          .eq("id", decisionRow.id)
      }

      const { data: statusRow } = await supabase
        .from("support_requests")
        .select("status")
        .eq("id", ticket.id)
        .maybeSingle()

      if (statusRow?.status === "agent_resolved") {
        results.auto_resolved++
      } else {
        if (statusRow?.status === "pending_agent") {
          await supabase
            .from("support_requests")
            .update({ status: "pending_human", resolution_source: "agent_draft" })
            .eq("id", ticket.id)
            .eq("status", "pending_agent")
        }
        results.flagged_human++
      }
    } catch (err) {
      results.errors++
      console.error("[agent-disputes] ticket error", ticket.id, err)
      const { error: resetErr } = await supabase
        .from("support_requests")
        .update({ status: "open", agent_run_at: null })
        .eq("id", ticket.id)
      if (resetErr) {
        console.error("[agent-disputes] reset ticket failed", ticket.id, resetErr.message)
      }
    }
  }

  return NextResponse.json({ ok: true, ...results })
}
