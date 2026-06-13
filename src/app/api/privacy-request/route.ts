import { NextRequest, NextResponse } from "next/server"

import { sendPrivacyRequestConfirmationEmail } from "@/lib/emails/privacy-request"
import { resolveResendFrom, sendEmail } from "@/lib/emails/send"
import {
  buildPrivacyRequestMessage,
  buildPrivacyRequestSubject,
  isPrivacyRequestType,
  isUsStateCode,
  privacyRequestTypeLabel,
  type PrivacyRequestType,
} from "@/lib/privacy-request"
import { rateLimit } from "@/lib/rate-limit"
import { sanitizeText } from "@/lib/sanitize"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type ValidationErrors = {
  name?: string
  email?: string
  state?: string
  request_type?: string
  details?: string
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? sanitizeText(value) : ""
}

function validatePayload(payload: unknown): {
  data?: {
    name: string
    email: string
    state: string
    requestType: PrivacyRequestType
    details: string
  }
  errors?: ValidationErrors
} {
  const errors: ValidationErrors = {}
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}

  const name = asTrimmedString(body.name)
  const email = asTrimmedString(body.email)
  const state = asTrimmedString(body.state)
  const requestTypeRaw = asTrimmedString(body.request_type)
  const details = asTrimmedString(body.details)

  if (name.length < 2) errors.name = "Full name is required."
  if (!EMAIL_REGEX.test(email)) errors.email = "Enter a valid email address."
  if (!isUsStateCode(state)) errors.state = "Select your state of residence."
  if (!isPrivacyRequestType(requestTypeRaw)) errors.request_type = "Select a request type."
  if (details.length > 2000) errors.details = "Details cannot exceed 2,000 characters."

  if (Object.keys(errors).length > 0) return { errors }

  return {
    data: {
      name,
      email,
      state,
      requestType: requestTypeRaw as PrivacyRequestType,
      details,
    },
  }
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
    identifier: "privacy-request",
  })
  if (limited) return limited

  const body = (await req.json().catch(() => null)) as { website?: unknown } | null
  const honeypot = typeof body?.website === "string" ? body.website.trim() : ""
  if (honeypot.length > 0) {
    return NextResponse.json({ success: true })
  }

  const validation = validatePayload(body)
  if (validation.errors) {
    return NextResponse.json({ errors: validation.errors }, { status: 400 })
  }

  const { name, email, state, requestType, details } = validation.data!
  const subject = buildPrivacyRequestSubject(requestType)
  const message = buildPrivacyRequestMessage(state, details)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const insertPayload = {
    user_id: user?.id ?? null,
    name,
    email,
    subject,
    message,
    priority: "high" as const,
  }
  const legacyInsertPayload = {
    name,
    email,
    subject,
    message,
  }

  let ticketNumber = "Pending"
  let submittedAt: string | null = new Date().toISOString()

  const { data, error } = await admin
    .from("support_requests")
    .insert(insertPayload)
    .select("ticket_number, created_at")
    .single()

  if (error?.code === "42703") {
    const { error: fallbackError } = await admin.from("support_requests").insert(legacyInsertPayload)
    if (fallbackError) {
      console.error("[api/privacy-request] insert fallback failed", fallbackError.message)
      return NextResponse.json({ error: "Unable to submit your request right now." }, { status: 500 })
    }
    ticketNumber = `TRM-${Date.now().toString().slice(-6)}`
  } else if (error || !data) {
    console.error("[api/privacy-request] insert failed", error?.message)
    return NextResponse.json({ error: "Unable to submit your request right now." }, { status: 500 })
  } else {
    ticketNumber = typeof data.ticket_number === "string" ? data.ticket_number : "Pending"
    submittedAt = typeof data.created_at === "string" ? data.created_at : submittedAt
  }

  const confirmationRecipient =
    process.env.NODE_ENV === "production" ? email : (process.env.RESEND_TEST_TO_EMAIL?.trim() ?? email)

  const confirmationResult = await sendPrivacyRequestConfirmationEmail({
    userId: user?.id ?? null,
    email: confirmationRecipient,
    name,
    ticketNumber,
  })

  if (!confirmationResult.sent) {
    console.error("[api/privacy-request] confirmation email failed", confirmationResult.error)
  }

  const supportRecipient =
    process.env.SUPPORT_EMAIL?.trim() ||
    (process.env.NODE_ENV === "production" ? "hello@usethrml.com" : "")

  if (supportRecipient) {
    const fromAddress = resolveResendFrom()
    void sendEmail({
      from: fromAddress,
      to: supportRecipient,
      subject: `[Privacy] ${ticketNumber} — ${privacyRequestTypeLabel(requestType)}`,
      html: `<p><strong>${subject}</strong></p><p>From: ${name} &lt;${email}&gt;</p><pre>${message}</pre><p>Submitted: ${submittedAt}</p>`,
      text: `${subject}\nFrom: ${name} <${email}>\n\n${message}\n\nSubmitted: ${submittedAt}`,
      replyTo: email,
    }).catch((err) => {
      console.error("[api/privacy-request] internal alert failed", err)
    })
  }

  return NextResponse.json({
    success: true,
    ticket_number: ticketNumber,
    request_type: requestType,
  })
}
