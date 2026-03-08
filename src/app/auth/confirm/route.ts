import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const callbackUrl = new URL("/auth/callback", requestUrl.origin)

  // Manual deploy reminder: verify Supabase Reset Password template + SMTP (Resend)
  // so recovery links route through this confirm/callback flow in production.
  requestUrl.searchParams.forEach((value, key) => {
    callbackUrl.searchParams.set(key, value)
  })

  return NextResponse.redirect(callbackUrl)
}
