import { NextRequest, NextResponse } from "next/server"

import { sendGuestWelcomeEmail, markOnboardingEmailSent } from "@/lib/emails/onboarding"
import { rateLimit } from "@/lib/rate-limit"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/events/user-registered
 * Called from the frontend immediately after a successful guest signup.
 * Sends the guest welcome email (idempotent — checks onboarding_email_sent flag).
 *
 * This route is intentionally separate from host onboarding, which fires
 * from /api/events/host-onboarding-started when a user starts the host flow.
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, {
    maxRequests: 5,
    windowMs: 60 * 1000,
    identifier: "user-registered",
  })
  if (limited) return limited

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, onboarding_email_sent")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.onboarding_email_sent) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const firstName = (profile?.full_name as string | null)?.split(" ")[0] ?? null

  const result = await sendGuestWelcomeEmail({
    userId: user.id,
    email: user.email,
    firstName,
  })

  if (result.sent) {
    await markOnboardingEmailSent(user.id)
  }

  return NextResponse.json({ ok: true, sent: result.sent })
}
