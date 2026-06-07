import { NextRequest, NextResponse } from "next/server"

import { sendHostWelcomeEmail, markOnboardingEmailSent } from "@/lib/emails/onboarding"
import { maybeFireHostOnboardingStarted } from "@/lib/meta/host-acquisition-events"
import { rateLimit } from "@/lib/rate-limit"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

type Body = {
  event_id?: string
  event_source_url?: string
  fbp?: string
  fbc?: string
  fbclid?: string
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

  const eventId = typeof body.event_id === "string" ? body.event_id.trim() : ""
  if (!eventId) {
    return NextResponse.json({ ok: false, error: "event_id is required" }, { status: 400 })
  }

  const admin = createAdminClient()
  const result = await maybeFireHostOnboardingStarted(admin, user, {
    eventId,
    headers: req.headers,
    eventSourceUrl:
      typeof body.event_source_url === "string" && body.event_source_url.trim()
        ? body.event_source_url.trim()
        : req.headers.get("referer") ?? undefined,
    fbp: typeof body.fbp === "string" ? body.fbp : undefined,
    fbc: typeof body.fbc === "string" ? body.fbc : undefined,
    fbclid: typeof body.fbclid === "string" ? body.fbclid : undefined,
  })

  // ── Host welcome email (idempotent, separate from CAPI) ───────────────────
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

  return NextResponse.json({ ok: true, capi: result })
}
