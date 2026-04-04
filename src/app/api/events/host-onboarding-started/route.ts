import { NextRequest, NextResponse } from "next/server"

import { hashIfPresent } from "@/lib/analytics/hash-for-meta"
import { sendHostWelcomeEmail, markOnboardingEmailSent } from "@/lib/emails/onboarding"
import { rateLimit } from "@/lib/rate-limit"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

type Body = {
  event_id?: string
  client_ip?: string
  client_user_agent?: string
  fbp?: string
  fbc?: string
  user_email?: string
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, {
    maxRequests: 30,
    windowMs: 60 * 1000,
    identifier: "host-onboarding-started",
  })
  if (limited) return limited

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const eventId = typeof body.event_id === "string" ? body.event_id : ""
  if (!eventId) {
    return NextResponse.json({ ok: false, error: "event_id is required" }, { status: 400 })
  }

  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "922697217019242"
  const accessToken = process.env.META_CONVERSIONS_API_TOKEN

  if (pixelId && accessToken) {
    const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    const headerUa = req.headers.get("user-agent") ?? undefined
    const ip = forwardedFor || body.client_ip
    const ua = headerUa || body.client_user_agent
    const emailSource = user.email ?? body.user_email

    const userData = {
      ...(hashIfPresent(emailSource) ? { em: hashIfPresent(emailSource) } : {}),
      ...(body.fbp ? { fbp: body.fbp } : {}),
      ...(body.fbc ? { fbc: body.fbc } : {}),
      ...(ip ? { client_ip_address: ip } : {}),
      ...(ua ? { client_user_agent: ua } : {}),
    }

    const requestBody = {
      data: [
        {
          event_name: "host_onboarding_started",
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: "website",
          event_source_url: req.headers.get("referer") ?? undefined,
          user_data: userData,
          custom_data: { content_name: "Host Onboarding" },
        },
      ],
      ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v22.0/${pixelId}/events?access_token=${accessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      )
      if (!response.ok) {
        const details = await response.text()
        console.error("[Meta CAPI host_onboarding_started] Request failed", response.status, details)
      }
    } catch (error) {
      console.error("[Meta CAPI host_onboarding_started] Send failed", error)
    }
  } else {
    console.warn("[Meta CAPI host_onboarding_started] Missing pixel id or META_CONVERSIONS_API_TOKEN — skipping analytics only")
  }

  // ── Host welcome email (idempotent) ──────────────────────────────────────
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, onboarding_email_sent")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile?.onboarding_email_sent && user.email) {
    const firstName = (profile?.full_name as string | null)?.split(" ")[0] ?? null
    const emailResult = await sendHostWelcomeEmail({
      userId: user.id,
      email: user.email,
      firstName,
    })
    if (emailResult.sent) {
      await markOnboardingEmailSent(user.id)
    }
  }

  return NextResponse.json({ ok: true })
}
