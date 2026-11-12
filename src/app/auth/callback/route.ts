import { NextRequest, NextResponse } from "next/server"

import { sendGuestWelcomeEmail, sendHostWelcomeEmail, markOnboardingEmailSent } from "@/lib/emails/onboarding"
import { isHostFunnelPath } from "@/lib/host/host-funnel"
import { LEGAL_VERSIONS } from "@/lib/legal-config"
import { recordLegalAcceptance } from "@/lib/legal/record-acceptance"
import { RETURN_TO_COOKIE, readReturnToCookie } from "@/lib/auth/return-to"
import { recordReferral } from "@/lib/referral"
import { sanitizeNextPath } from "@/lib/security"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const OTP_AUTO_SIGN_IN_TYPES = new Set(["signup", "invite", "email", "email_change"])

function loginFallbackUrl(requestUrl: URL, next: string | null) {
  const loginUrl = new URL("/login", requestUrl.origin)
  loginUrl.searchParams.set("message", "please_sign_in")
  if (next) loginUrl.searchParams.set("next", next)
  return loginUrl
}

function clearOAuthSignupCookies(response: NextResponse) {
  response.cookies.delete("thrml_signup_terms")
  response.cookies.delete("thrml_signup_newsletter")
  response.cookies.delete(RETURN_TO_COOKIE)
  return response
}

async function applyOAuthSignupMetadata(request: NextRequest, userId: string) {
  if (!request.cookies.get("thrml_signup_terms")?.value) return

  const newsletterOptIn = request.cookies.get("thrml_signup_newsletter")?.value === "1"
  const admin = createAdminClient()
  const profilePayload: Record<string, unknown> = {
    id: userId,
    terms_accepted: true,
    terms_accepted_at: new Date().toISOString(),
    terms_version: LEGAL_VERSIONS.TERMS,
    privacy_version: LEGAL_VERSIONS.PRIVACY,
    newsletter_opted_in: newsletterOptIn,
    newsletter_opted_in_at: newsletterOptIn ? new Date().toISOString() : null,
    notification_preferences: {
      marketing_wellness_tips: newsletterOptIn,
    },
  }

  await recordLegalAcceptance({
    admin,
    userId,
    docType: "terms_of_service",
    version: LEGAL_VERSIONS.TERMS,
    headers: request.headers,
  })

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { error: profileError } = await admin.from("profiles").upsert(profilePayload, { onConflict: "id" })
    if (!profileError) return
    const missingColumnMatch = profileError.message?.match(/'([^']+)' column/i)
    const missingColumn = missingColumnMatch?.[1]
    if (!missingColumn || !(missingColumn in profilePayload)) return
    delete profilePayload[missingColumn]
  }
}

async function resolvePostAuthRedirect(request: NextRequest, requestUrl: URL, next: string | null) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return clearOAuthSignupCookies(NextResponse.redirect(loginFallbackUrl(requestUrl, next)))
  }

  await applyOAuthSignupMetadata(request, user.id)

  const refRaw = request.cookies.get("thrml_ref")?.value
  if (refRaw) {
    await recordReferral(user.id, decodeURIComponent(refRaw))
  }

  // Host prospects arrive with a host-funnel `next` (e.g. /become-a-host). Tag them as hosts
  // so lifecycle reminders reach them even before they publish a listing (Google sign-ups
  // never pick an intent on the form).
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, onboarding_email_sent, ui_intent")
    .eq("id", user.id)
    .maybeSingle()

  const currentIntent = typeof profile?.ui_intent === "string" ? profile.ui_intent : null
  const hostProspect =
    isHostFunnelPath(next) || currentIntent === "host" || currentIntent === "both"
  if (isHostFunnelPath(next) && currentIntent !== "host" && currentIntent !== "both") {
    await admin
      .from("profiles")
      .update({ ui_intent: currentIntent === "guest" ? "both" : "host" })
      .eq("id", user.id)
  }

  // Fire welcome email for first-time users (covers OAuth + email/OTP flows).
  // Hosts get the host welcome; everyone else the guest one. Non-blocking.
  if (user.email && !profile?.onboarding_email_sent) {
    const firstName = (profile?.full_name as string | null)?.split(" ")[0] ?? null
    const send = hostProspect ? sendHostWelcomeEmail : sendGuestWelcomeEmail
    send({ userId: user.id, email: user.email, firstName })
      .then((result) => { if (result.sent) markOnboardingEmailSent(user.id) })
      .catch(() => {})
  }

  if (next) {
    return clearOAuthSignupCookies(NextResponse.redirect(new URL(next, requestUrl.origin)))
  }

  const destination = currentIntent === "host" ? "/dashboard" : "/explore"
  return clearOAuthSignupCookies(NextResponse.redirect(new URL(destination, requestUrl.origin)))
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const tokenHash = requestUrl.searchParams.get("token_hash")
  const type = requestUrl.searchParams.get("type")
  const code = requestUrl.searchParams.get("code")
  const recoveryNext = sanitizeNextPath(requestUrl.searchParams.get("next"), "/auth/reset-password")
  // Prefer the explicit ?next=; fall back to the cookie set before sign-in, which survives Supabase
  // replacing our redirect URL with the Site URL.
  const next =
    sanitizeNextPath(requestUrl.searchParams.get("next"), null) ??
    readReturnToCookie(request.cookies.get(RETURN_TO_COOKIE)?.value)

  if (tokenHash && type === "recovery") {
    const supabase = await createClient()

    // Manual deploy checklist:
    // 1) Supabase Auth -> Email Templates -> Reset Password is enabled with {{ .ConfirmationURL }}.
    // 2) Supabase Auth -> SMTP: Resend (smtp.resend.com) or Zoho (e.g. hello@usethrml.com) — use a verified From.
    // 3) App transactional mail uses Resend from notifications@usethrml.com; replies can go to hello@usethrml.com (Zoho).
    const { error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    })

    if (!error) {
      return NextResponse.redirect(new URL(recoveryNext, requestUrl.origin))
    }

    return NextResponse.redirect(new URL("/login?error=invalid_reset_link", requestUrl.origin))
  }

  if (tokenHash && type && OTP_AUTO_SIGN_IN_TYPES.has(type)) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type: type as "signup" | "invite" | "email" | "email_change",
      token_hash: tokenHash,
    })

    if (!error) {
      if (type === "email_change" && !next) {
        return NextResponse.redirect(new URL("/dashboard/account?email_change=confirmed", requestUrl.origin))
      }
      return resolvePostAuthRedirect(request, requestUrl, next)
    }

    return NextResponse.redirect(loginFallbackUrl(requestUrl, next))
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return resolvePostAuthRedirect(request, requestUrl, next)
    }
    return NextResponse.redirect(loginFallbackUrl(requestUrl, next))
  }

  if (tokenHash || type === "recovery") {
    return NextResponse.redirect(new URL("/login?error=invalid_reset_link", requestUrl.origin))
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin))
}
