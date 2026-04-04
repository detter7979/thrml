import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"

import { resolveResendFrom, resolveResendReplyTo } from "@/lib/emails/send"
import { newsletterWelcomeVariantA as welcomeEmail } from "@/lib/emails/templates"
import { rateLimit } from "@/lib/rate-limit"
import { sanitizeText } from "@/lib/sanitize"
import { createAdminClient } from "@/lib/supabase/admin"

const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, {
      maxRequests: 3,
      windowMs: 10 * 60 * 1000,
      identifier: "newsletter",
    })
    if (limited) return limited

    const body = (await request.json().catch(() => null)) as { email?: unknown; website?: unknown } | null
    const honeypot = typeof body?.website === "string" ? body.website.trim() : ""
    if (honeypot.length > 0) {
      // Silently accept but do not process to avoid tipping off bots.
      return NextResponse.json({ success: true })
    }

    const email = typeof body?.email === "string" ? sanitizeText(body.email).toLowerCase() : ""
    if (!VALID_EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: existing, error: selectError } = await supabase
      .from("newsletter_subscribers")
      .select("id")
      .eq("email", email)
      .eq("is_active", true)
      .maybeSingle()

    if (selectError) {
      throw selectError
    }

    if (existing) {
      return NextResponse.json({ message: "Already subscribed" })
    }

    const { data: insertData, error: upsertError } = await supabase
      .from("newsletter_subscribers")
      .upsert(
        {
          email,
          source: "homepage",
          is_active: true,
          unsubscribed_at: null,
        },
        { onConflict: "email" }
      )
      .select("id, email, is_active, subscribed_at, unsubscribed_at")
      .single()

    if (upsertError) throw upsertError
    console.log("Subscriber inserted:", insertData)

    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not set")
      return NextResponse.json({ message: "Subscribed" })
    }

    const resend = new Resend(resendApiKey)
    const emailTemplate = welcomeEmail({ email })
    const fromAddress = resolveResendFrom()
    const replyTo = resolveResendReplyTo()
    const recipient =
      process.env.NODE_ENV === "production" ? email : (process.env.RESEND_TEST_TO_EMAIL?.trim() ?? email)

    try {
      const { data: resendData, error: resendError } = await resend.emails.send({
        from: fromAddress,
        to: [recipient],
        subject: emailTemplate.subject,
        html: emailTemplate.html,
        text: emailTemplate.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      })

      if (resendError) {
        console.error("Resend error:", JSON.stringify(resendError, null, 2))
      } else {
        console.log("[newsletter/subscribe] welcome email sent", { recipient, resendId: resendData?.id ?? null })
      }
    } catch (emailError) {
      console.error("Welcome email failed:", emailError)
    }

    return NextResponse.json({ message: "Subscribed" })
  } catch (error) {
    console.error("Subscription failed:", error)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
