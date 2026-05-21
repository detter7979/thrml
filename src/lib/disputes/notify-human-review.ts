import { buildHumanReviewEscalationEmail } from "@/lib/emails/support"
import { resolveResendFrom, sendEmail } from "@/lib/emails/send"
import { createAdminClient } from "@/lib/supabase/admin"

import type { ClassificationResult } from "./classifier"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://usethrml.com"

export type HumanReviewNotifyContext = {
  supportRequestId: string
  ticketNumber: string
  subject: string
  name: string
  email: string
  bookingId: string | null
  classification: ClassificationResult
  executionAction?: string | null
  executionError?: string | null
}

function resolveSupportRecipient() {
  const configured = process.env.SUPPORT_EMAIL?.trim()
  if (configured) return configured
  return process.env.NODE_ENV === "production" ? "hello@usethrml.com" : ""
}

function escalationSeverity(ctx: HumanReviewNotifyContext): "CRITICAL" | "WARNING" {
  const reason = (ctx.classification.human_review_reason ?? "").toLowerCase()
  const subject = ctx.subject.toLowerCase()
  if (
    subject.includes("safety") ||
    reason.includes("safety") ||
    reason.includes("legal") ||
    reason.includes("lawyer") ||
    reason.includes("sue") ||
    reason.includes("court")
  ) {
    return "CRITICAL"
  }
  return "WARNING"
}

export async function notifyHumanReviewEscalation(ctx: HumanReviewNotifyContext): Promise<void> {
  const to = resolveSupportRecipient()
  if (!to) {
    console.warn("[disputes] human review notify skipped — SUPPORT_EMAIL not configured")
    return
  }

  const c = ctx.classification
  const emailContent = await buildHumanReviewEscalationEmail({
    ticketNumber: ctx.ticketNumber,
    subject: ctx.subject,
    name: ctx.name,
    email: ctx.email,
    bookingId: ctx.bookingId,
    disputeCategory: c.dispute_category,
    confidence: c.confidence,
    recommendedAction: c.recommended_action,
    refundAmount: c.refund_amount,
    refundPct: c.refund_pct,
    humanReviewReason: c.human_review_reason,
    classificationReasoning: c.classification_reasoning,
    executionAction: ctx.executionAction,
    executionError: ctx.executionError,
  })

  const emailResult = await sendEmail({
    from: resolveResendFrom(),
    to,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
    replyTo: ctx.email,
  })

  if (!emailResult.sent) {
    console.error("[disputes] human review escalation email failed", {
      ticket: ctx.ticketNumber,
      error: emailResult.error,
    })
  }

  try {
    const admin = createAdminClient()
    const severity = escalationSeverity(ctx)
    const { error } = await admin.from("ops_alerts").insert({
      severity,
      category: "support",
      message: `Dispute ticket ${ctx.ticketNumber} needs human review`,
      details: {
        support_request_id: ctx.supportRequestId,
        ticket_number: ctx.ticketNumber,
        subject: ctx.subject,
        dispute_category: c.dispute_category,
        human_review_reason: c.human_review_reason,
        recommended_action: c.recommended_action,
        refund_amount: c.refund_amount,
        review_url: `${APP_URL}/admin/inbox/disputes`,
      },
      resolved: false,
    })
    if (error) {
      console.error("[disputes] ops_alert insert failed", error.message)
    }
  } catch (err) {
    console.error("[disputes] ops_alert insert failed", err)
  }
}
