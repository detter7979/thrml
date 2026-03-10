import { NextRequest, NextResponse } from "next/server"

import { sanitizeNextPath } from "@/lib/security"
import { createClient } from "@/lib/supabase/server"

const OTP_AUTO_SIGN_IN_TYPES = new Set(["signup", "invite", "email", "email_change"])

function loginFallbackUrl(requestUrl: URL, next: string | null) {
  const loginUrl = new URL("/login", requestUrl.origin)
  loginUrl.searchParams.set("message", "please_sign_in")
  if (next) loginUrl.searchParams.set("next", next)
  return loginUrl
}

async function resolvePostAuthRedirect(requestUrl: URL, next: string | null) {
  if (next) return NextResponse.redirect(new URL(next, requestUrl.origin))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(loginFallbackUrl(requestUrl, next))
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ui_intent")
    .eq("id", user.id)
    .maybeSingle()

  const destination = profile?.ui_intent === "host" ? "/dashboard" : "/"
  return NextResponse.redirect(new URL(destination, requestUrl.origin))
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
    // 2) Supabase Auth -> SMTP uses Resend (smtp.resend.com:465, username "resend", API key password).
    // 3) Sender email matches your verified domain (for example notifications@usethermal.com).
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
      return resolvePostAuthRedirect(requestUrl, next)
    }

    return NextResponse.redirect(loginFallbackUrl(requestUrl, next))
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return resolvePostAuthRedirect(requestUrl, next)
    }
    return NextResponse.redirect(loginFallbackUrl(requestUrl, next))
  }

  if (tokenHash || type === "recovery") {
    return NextResponse.redirect(new URL("/login?error=invalid_reset_link", requestUrl.origin))
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin))
}
