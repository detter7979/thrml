import { NextRequest, NextResponse } from "next/server"

import { sanitizeNextPath } from "@/lib/security"
import { createClient } from "@/lib/supabase/server"

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

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)

    if (next) return NextResponse.redirect(new URL(next, requestUrl.origin))

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("ui_intent")
        .eq("id", user.id)
        .maybeSingle()

      const destination = profile?.ui_intent === "host" ? "/dashboard" : "/"
      return NextResponse.redirect(new URL(destination, requestUrl.origin))
    }
  }

  if (tokenHash || type === "recovery") {
    return NextResponse.redirect(new URL("/login?error=invalid_reset_link", requestUrl.origin))
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin))
}
