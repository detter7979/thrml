import { NextRequest, NextResponse } from "next/server"

import { buildSupportConfirmationEmail, buildSupportInternalAlertEmail } from "@/lib/emails/support"
import { resolveResendFrom, sendEmail } from "@/lib/emails/send"
import { rateLimit } from "@/lib/rate-limit"
import { sanitizeText } from "@/lib/sanitize"
import { deriveSupportPriority, SUPPORT_SUBJECTS, type SupportSubject } from "@/lib/support"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

type ValidationErrors = {
  name?: string
  email?: string
  subject?: string
  message?: string
  booking_id?: string
}

type ValidSupportPayload = {
  name: string
  email: string
  subject: SupportSubject
  message: string
  booking_id: string | null
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const DISPUTE_AGENT_SUBJECTS = [
  "Access & Entry",
  "Booking & Cancellation",
  "Payment & Refunds",
  "Safety Concern",
] as const

function triggerDisputeAgent(subject: string) {
  if (!DISPUTE_AGENT_SUBJECTS.includes(subject as (typeof DISPUTE_AGENT_SUBJECTS)[number])) return
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
  const secret = process.env.CRON_SECRET
  if (!base || !secret) return
  const agentUrl = `${base}/api/cron/agent-disputes`
  fetch(agentUrl, { headers: { "x-cron-secret": secret } }).catch((err) => {
    console.error("[api/support] dispute agent trigger failed", err)
  })
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? sanitizeText(value) : ""
}

function validateSupportPayload(payload: unknown): { data?: ValidSupportPayload; errors?: ValidationErrors } {
  const errors: ValidationErrors = {}
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}

  const name = asTrimmedString(body.name)
  const email = asTrimmedString(body.email)
  const subject = asTrimmedString(body.subject)
  const message = asTrimmedString(body.message)
  const bookingIdRaw = body.booking_id ?? body.bookingId
  const bookingId = typeof bookingIdRaw === "string" ? sanitizeText(bookingIdRaw) : ""

  if (name.length < 2) errors.name = "Name must be at least 2 characters."
  if (!EMAIL_REGEX.test(email)) errors.email = "Enter a valid email address."
  if (!SUPPORT_SUBJECTS.includes(subject as SupportSubject)) {
    errors.subject = "Select a valid topic."
  }
  if (message.length < 20) {
    errors.message = "Message must be at least 20 characters."
  } else if (message.length > 500) {
    errors.message = "Message cannot exceed 500 characters."
  }
  if (bookingId && !UUID_REGEX.test(bookingId)) {
    errors.booking_id = "Booking reference must be a valid UUID."
  }

  if (Object.keys(errors).length > 0) return { errors }

  return {
    data: {
      name,
      email,
      subject: subject as SupportSubject,
      message,
      booking_id: bookingId || null,
    },
  }
}

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, {
      maxRequests: 5,
      windowMs: 15 * 60 * 1000,
      identifier: "support",
    })
    if (limited) return limited

    const body = (await req.json().catch(() => null)) as { website?: unknown } | null
    const honeypot = typeof body?.website === "string" ? body.website.trim() : ""
    if (honeypot.length > 0) {
      // Silently accept but do not process to avoid tipping off bots.
      return NextResponse.json({ success: true })
    }

    const validation = validateSupportPayload(body)
    if (validation.errors) {
      return NextResponse.json({ errors: validation.errors }, { status: 400 })
    }

    const { name, email, subject, message, booking_id } = validation.data as ValidSupportPayload

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const supabaseAdmin = createAdminClient()
    let validatedBookingId: string | null = booking_id

    if (validatedBookingId && user?.id) {
      const { data: ownedBooking, error: bookingOwnershipError } = await supabaseAdmin
        .from("bookings")
        .select("id")
        .eq("id", validatedBookingId)
        .or(`guest_id.eq.${user.id},host_id.eq.${user.id}`)
        .maybeSingle()

      if (bookingOwnershipError) {
        console.error("[api/support] booking ownership check failed", {
          userId: user.id,
          bookingId: validatedBookingId,
          error: bookingOwnershipError.message,
        })
        validatedBookingId = null
      } else if (!ownedBooking) {
        validatedBookingId = null
      }
    }

    const priority = deriveSupportPriority(subject)

    const insertPayload = {
      user_id: user?.id ?? null,
      name,
      email,
      subject,
      booking_id: validatedBookingId ?? null,
      message,
      priority,
    }
    const legacyInsertPayload = {
      name,
      email,
      subject,
      booking_id: validatedBookingId ?? null,
      message,
    }

    let ticketNumber = "Pending"
    let savedPriority = priority
    let submittedAt: string | null = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from("support_requests")
      .insert(insertPayload)
      .select("ticket_number, priority, created_at")
      .single()

    if (error?.code === "42703") {
      // Legacy schema fallback: retry insert without newer columns like user_id/priority.
      const { error: fallbackError } = await supabaseAdmin.from("support_requests").insert(legacyInsertPayload)
      if (fallbackError) {
        console.error("[api/support] support insert fallback failed", {
          error: fallbackError.message,
        })
        return NextResponse.json(
          { error: "Unable to submit your request right now. Please try again." },
          { status: 500 }
        )
      }
      ticketNumber = `TRM-${Date.now().toString().slice(-6)}`
    } else if (error || !data) {
      console.error("[api/support] support insert failed", {
        error: error?.message ?? "Unknown insert error",
      })
      return NextResponse.json({ error: "Unable to submit your request right now. Please try again." }, { status: 500 })
    } else {
      ticketNumber = typeof data.ticket_number === "string" ? data.ticket_number : "Pending"
      savedPriority = (data.priority as "urgent" | "high" | "normal") ?? priority
      submittedAt = typeof data.created_at === "string" ? data.created_at : submittedAt
    }

    triggerDisputeAgent(subject)

    const confirmationEmail = buildSupportConfirmationEmail({
      name,
      ticketNumber,
      subject,
      bookingId: validatedBookingId,
      message,
      priority: savedPriority,
    })

    const internalEmail = buildSupportInternalAlertEmail({
      ticketNumber,
      priority: savedPriority,
      subject,
      submittedAt,
      name,
      email,
      userId: user?.id ?? null,
      bookingId: validatedBookingId,
      message,
    })

    const supportRecipient =
      process.env.SUPPORT_EMAIL?.trim() ||
      (process.env.NODE_ENV === "production" ? "hello@usethrml.com" : "")
    const fromAddress = resolveResendFrom()
    const confirmationRecipient =
      process.env.NODE_ENV === "production" ? email : (process.env.RESEND_TEST_TO_EMAIL?.trim() ?? email)

    const [confirmationResult, internalResult] = await Promise.all([
      sendEmail({
        from: fromAddress,
        to: confirmationRecipient,
        subject: confirmationEmail.subject,
        html: confirmationEmail.html,
        text: confirmationEmail.text,
        userId: user?.id ?? null,
      }),
      supportRecipient
        ? sendEmail({
            from: fromAddress,
            to: supportRecipient,
            subject: internalEmail.subject,
            html: internalEmail.html,
            text: internalEmail.text,
            replyTo: email,
          })
        : Promise.resolve({ sent: false, error: "SUPPORT_EMAIL not configured" }),
    ])

    if (!confirmationResult.sent) {
      console.error("[api/support] confirmation email failed", {
        ticketNumber,
        error: confirmationResult.error ?? "Unknown confirmation email error",
      })
    }

    if (!internalResult.sent) {
      console.error("[api/support] internal support email failed", {
        ticketNumber,
        error: internalResult.error ?? "Unknown internal email error",
      })
    }

    return NextResponse.json({
      message: "Ticket submitted",
      ticket_number: ticketNumber,
      priority: savedPriority,
    })
  } catch (error) {
    console.error("[api/support] unexpected error", {
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return NextResponse.json({ error: "Unable to submit your request right now. Please try again." }, { status: 500 })
  }
}
