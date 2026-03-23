import { sendEmail } from "@/lib/emails/send"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

import type { BookingContext, ClassificationResult } from "./classifier"

export type ExecutionResult = {
  action_taken: string
  action_executed: boolean
  execution_error: string | null
  stripe_refund_id: string | null
}

export type ExecuteResolutionOptions = {
  /** When true, run resolution even if confidence is not high or human review was required (admin approval). */
  bypassAutoGate?: boolean
}

export async function executeResolution(
  supportRequestId: string,
  ticketNumber: string,
  booking: BookingContext,
  classification: ClassificationResult,
  userEmail: string,
  userName: string,
  options?: ExecuteResolutionOptions
): Promise<ExecutionResult> {
  const supabase = createAdminClient()
  let stripeRefundId: string | null = null
  let executionError: string | null = null
  let actionTaken: string = classification.recommended_action
  let executed = false
  const bypassAutoGate = options?.bypassAutoGate === true

  if (!bypassAutoGate && (classification.confidence !== "high" || classification.requires_human_review)) {
    return {
      action_taken: "flagged_for_human_review",
      action_executed: false,
      execution_error: null,
      stripe_refund_id: null,
    }
  }

  try {
    if (
      classification.refund_amount > 0 &&
      booking.booking_id &&
      (classification.recommended_action === "full_refund" ||
        classification.recommended_action === "partial_refund")
    ) {
      try {
        const { data: bookingRow } = await supabase
          .from("bookings")
          .select("stripe_payment_intent_id, total_charged, refunded_amount")
          .eq("id", booking.booking_id)
          .maybeSingle()

        const paymentIntentId = bookingRow?.stripe_payment_intent_id as string | null | undefined

        if (paymentIntentId) {
          const refundAmountCents = Math.round(classification.refund_amount * 100)
          const maxRefundableCents = Math.round(Number(bookingRow?.total_charged ?? 0) * 100)
          const alreadyRefundedCents = Math.round(Number(bookingRow?.refunded_amount ?? 0) * 100)
          if (refundAmountCents > 0 && alreadyRefundedCents + refundAmountCents <= maxRefundableCents) {
            const refund = await stripe.refunds.create({
              payment_intent: paymentIntentId,
              amount: refundAmountCents,
              reason: "requested_by_customer",
              metadata: {
                support_ticket: ticketNumber,
                dispute_category: classification.dispute_category,
                auto_resolved: bypassAutoGate ? "human_approved" : "true",
              },
            })
            stripeRefundId = refund.id
            actionTaken = `refund_issued_${refund.id}`

            const refundedAmount =
              Number(bookingRow?.refunded_amount ?? 0) + classification.refund_amount
            await supabase
              .from("bookings")
              .update({
                refunded_amount: refundedAmount,
                refunded_at: new Date().toISOString(),
                stripe_refund_id: refund.id,
              })
              .eq("id", booking.booking_id)
          } else if (alreadyRefundedCents + refundAmountCents > maxRefundableCents) {
            executionError = "Refund would exceed total charged — queued for manual processing"
            actionTaken = "refund_needs_manual"
            await supabase
              .from("support_requests")
              .update({ status: "pending_human", resolution_source: "agent_draft" })
              .eq("id", supportRequestId)
            return {
              action_taken: actionTaken,
              action_executed: false,
              execution_error: executionError,
              stripe_refund_id: null,
            }
          }
        } else {
          executionError = "No payment intent found for booking — refund queued for manual processing"
          actionTaken = "refund_needs_manual"
          await supabase
            .from("support_requests")
            .update({ status: "pending_human", resolution_source: "agent_draft" })
            .eq("id", supportRequestId)
          return {
            action_taken: actionTaken,
            action_executed: false,
            execution_error: executionError,
            stripe_refund_id: null,
          }
        }
      } catch (refundErr) {
        executionError =
          refundErr instanceof Error ? refundErr.message : "Stripe refund failed"
        actionTaken = "refund_failed"
        await supabase
          .from("support_requests")
          .update({ status: "pending_human", resolution_source: "agent_draft" })
          .eq("id", supportRequestId)
        return {
          action_taken: actionTaken,
          action_executed: false,
          execution_error: executionError,
          stripe_refund_id: null,
        }
      }
    }

    if (booking.booking_id && classification.dispute_category === "host_no_show") {
      try {
        await supabase
          .from("bookings")
          .update({ status: "cancelled" })
          .eq("id", booking.booking_id)
          .eq("status", "confirmed")
      } catch {
        /* non-fatal */
      }
    }

    try {
      await supabase
        .from("support_requests")
        .update({
          status: "agent_resolved",
          resolution_source: bypassAutoGate ? "human_approved" : "agent_auto",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", supportRequestId)
    } catch (updateErr) {
      executionError =
        updateErr instanceof Error ? updateErr.message : "Failed to update support request"
      throw updateErr
    }

    executed = true

    const fromAddress = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev"
    const toAddress =
      process.env.NODE_ENV === "production" ? userEmail : (process.env.RESEND_TEST_TO_EMAIL ?? userEmail)

    await sendEmail({
      from: fromAddress,
      to: toAddress,
      subject: `Your request has been resolved — ${ticketNumber}`,
      html: buildResolutionEmail(userName, ticketNumber, classification),
      text: buildResolutionEmailText(userName, ticketNumber, classification),
    }).catch((err) => {
      console.error("[dispute-executor] resolution email failed", err)
    })
  } catch (err) {
    executionError = err instanceof Error ? err.message : "Unknown execution error"
    executed = false
    const { error: fallbackUpdErr } = await supabase
      .from("support_requests")
      .update({ status: "pending_human", resolution_source: "agent_draft" })
      .eq("id", supportRequestId)
    if (fallbackUpdErr) {
      console.error("[dispute-executor] pending_human fallback failed", fallbackUpdErr.message)
    }
  }

  return {
    action_taken: actionTaken,
    action_executed: executed,
    execution_error: executionError,
    stripe_refund_id: stripeRefundId,
  }
}

function buildResolutionEmail(name: string, ticket: string, c: ClassificationResult): string {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://usethrml.com"
  const safeName = name.replace(/[<>&"']/g, "")
  const safeTicket = ticket.replace(/[<>&"']/g, "")
  const safeReply = c.suggested_reply
    .replace(/\n/g, "<br/>")
    .replace(/[<>&"']/g, (m) => (({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m] ?? m)

  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2C2420;padding:24px;">
  <div style="font-size:20px;font-weight:700;margin-bottom:20px;">Thrml</div>
  <p>Hi ${safeName},</p>
  <p>Your support ticket <strong>${safeTicket}</strong> has been reviewed and resolved.</p>
  <div style="background:#F7F3EE;border-radius:10px;padding:16px;margin:16px 0;font-size:14px;line-height:1.7;">
    ${safeReply}
  </div>
  ${c.refund_amount > 0 ? `<p style="background:#E8F5E9;border-radius:8px;padding:12px 16px;color:#2E7D32;font-weight:600;">Refund of $${c.refund_amount.toFixed(2)} has been issued. Please allow 5–10 business days to appear on your statement.</p>` : ""}
  <p>If you have further questions, reply to this email or visit <a href="${APP_URL}/support">our support centre</a>.</p>
  <p style="font-size:12px;color:#888;">thrml · usethrml.com</p>
</div>`
}

function buildResolutionEmailText(name: string, ticket: string, c: ClassificationResult): string {
  return [
    `Hi ${name},`,
    `Your support ticket ${ticket} has been reviewed and resolved.`,
    "",
    c.suggested_reply,
    c.refund_amount > 0
      ? `\nRefund of $${c.refund_amount.toFixed(2)} has been issued. Please allow 5–10 business days.`
      : "",
    "\nthrml · usethrml.com",
  ]
    .filter((s) => s !== null)
    .join("\n")
}
