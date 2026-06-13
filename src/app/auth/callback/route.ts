import { NextRequest, NextResponse } from "next/server"

import { sendGuestWelcomeEmail, markOnboardingEmailSent } from "@/lib/emails/onboarding"
import { LEGAL_VERSIONS } from "@/lib/legal-config"
import { recordLegalAcceptance } from "@/lib/legal/record-acceptance"
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

  // Fire welcome email for first-time users (covers OAuth + email/OTP flows).
  // Non-blocking — redirect is not held up if this fails.
  if (user.email) {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, onboarding_email_sent")
      .eq("id", user.id)
      .maybeSingle()

    if (!profile?.onboarding_email_sent) {
      const firstName = (profile?.full_name as string | null)?.split(" ")[0] ?? null
      sendGuestWelcomeEmail({ userId: user.id, email: user.email, firstName })
        .then((result) => { if (result.sent) markOnboardingEmailSent(user.id) })
        .catch(() => {})
    }
  }

  if (next) {
    return clearOAuthSignupCookies(NextResponse.redirect(new URL(next, requestUrl.origin)))
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ui_intent")
    .eq("id", user.id)
    .maybeSingle()

  const destination = profile?.ui_intent === "host" ? "/dashboard" : "/explore"
  return clearOAuthSignupCookies(NextResponse.redirect(new URL(destination, requestUrl.origin)))
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const tokenHash = requestUrl.searchParams.get("token_hash")
  const type = requestUrl.searchParams.get("type")
  const code = requestUrl.searchParams.get("code")
  const recoveryNext = sanitizeNextPath(requestUrl.searchParams.get("next"), "/auth/reset-password")
  const next = sanitizeNextPath(requestUrl.searchParams.get("next"), null)

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
