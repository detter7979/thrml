import {
  buildSafetyIncidentAdminEmail,
  buildSafetyIncidentGuestEmail,
} from "@/lib/emails/incident"
import { resolveResendFrom, sendEmail } from "@/lib/emails/send"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { ClassificationResult } from "./classifier"

export function isSafetyInjuryCategory(classification: ClassificationResult) {
  return classification.dispute_category === "safety_injury"
}

function resolveSupportRecipient() {
  const configured = process.env.SUPPORT_EMAIL?.trim()
  if (configured) return configured
  return process.env.NODE_ENV === "production" ? "hello@usethrml.com" : ""
}

export type SafetyIncidentFollowUpParams = {
  supabase: SupabaseClient
  supportRequestId: string
  ticketNumber: string
  bookingId: string
  reporterUserId: string
  guestEmail: string
  guestName: string
  refundAmount: number
}

export async function runSafetyIncidentFollowUp(params: SafetyIncidentFollowUpParams) {
  const errors: string[] = []
  let incidentReportId: string | null = null

  try {
    const { data: existing } = await params.supabase
      .from("incident_reports")
      .select("id")
      .eq("support_request_id", params.supportRequestId)
      .maybeSingle()

    if (existing?.id) {
      incidentReportId = existing.id
    } else {
      const { data: inserted, error: insertError } = await params.supabase
        .from("incident_reports")
        .insert({
          support_request_id: params.supportRequestId,
          booking_id: params.bookingId,
          reporter_user_id: params.reporterUserId,
          status: "submitted",
          evidence_paths: [],
          narrative: "",
        })
        .select("id")
        .single()

      if (insertError || !inserted?.id) {
        throw new Error(insertError?.message ?? "Unable to create incident report stub")
      }

      incidentReportId = inserted.id
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Incident report stub failed"
    errors.push(message)
    console.error("[disputes/safety-followup] incident_reports insert failed", message)
  }

  const toGuest =
    process.env.NODE_ENV === "production"
      ? params.guestEmail
      : (process.env.RESEND_TEST_TO_EMAIL ?? params.guestEmail)

  if (toGuest) {
    try {
      const guestEmail = await buildSafetyIncidentGuestEmail({
        name: params.guestName,
        bookingId: params.bookingId,
        ticketNumber: params.ticketNumber,
        refundAmount: params.refundAmount,
      })

      const guestResult = await sendEmail({
        from: resolveResendFrom(),
        to: toGuest,
        subject: guestEmail.subject,
        html: guestEmail.html,
        text: guestEmail.text,
      })

      if (!guestResult.sent) {
        errors.push(guestResult.error ?? "Guest incident email failed")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Guest incident email failed"
      errors.push(message)
      console.error("[disputes/safety-followup] guest email failed", message)
    }
  }

  const adminTo = resolveSupportRecipient()
  if (adminTo) {
    try {
      const adminEmail = await buildSafetyIncidentAdminEmail({
        ticketNumber: params.ticketNumber,
        bookingId: params.bookingId,
        guestName: params.guestName,
        guestEmail: params.guestEmail,
        incidentReportId,
        refundAmount: params.refundAmount,
      })

      const adminResult = await sendEmail({
        from: resolveResendFrom(),
        to: adminTo,
        subject: adminEmail.subject,
        html: adminEmail.html,
        text: adminEmail.text,
        replyTo: params.guestEmail,
      })

      if (!adminResult.sent) {
        errors.push(adminResult.error ?? "Admin incident notification failed")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Admin incident notification failed"
      errors.push(message)
      console.error("[disputes/safety-followup] admin email failed", message)
    }
  } else {
    console.warn("[disputes/safety-followup] admin notify skipped — SUPPORT_EMAIL not configured")
  }

  return { incidentReportId, errors }
}
