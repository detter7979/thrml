import { NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Step 2: Zoho redirects here with ?code=... after user approves.
 * Exchanges the code for access + refresh tokens, stores refresh token in Supabase.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const error = url.searchParams.get("error")

  if (error) {
    return NextResponse.json({ error: `Zoho OAuth error: ${error}` }, { status: 400 })
  }
  if (!code) {
    return NextResponse.json({ error: "No authorization code received" }, { status: 400 })
  }

  const clientId = process.env.ZOHO_CLIENT_ID
  const clientSecret = process.env.ZOHO_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET not set" }, { status: 500 })
  }

  const redirectUri = `${url.origin}/api/auth/zoho/callback`

  // Exchange code for tokens
  const tokenRes = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    return NextResponse.json({ error: `Token exchange failed: ${body}` }, { status: 500 })
  }

  const tokens = await tokenRes.json() as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
  }

  if (tokens.error || !tokens.refresh_token) {
    return NextResponse.json({ error: `No refresh token returned: ${JSON.stringify(tokens)}` }, { status: 500 })
  }

  // Store tokens in Supabase platform_settings
  const admin = createAdminClient()
  const expiry = Date.now() + (tokens.expires_in ?? 3600) * 1000

  await admin.from("platform_settings").upsert([
    { key: "zoho_refresh_token", value: `"${tokens.refresh_token}"` },
    { key: "zoho_access_token", value: `"${tokens.access_token}"` },
    { key: "zoho_token_expiry", value: `"${String(expiry)}"` },
  ], { onConflict: "key" })

  return new NextResponse(`
    <html><body style="font-family:system-ui;padding:40px;max-width:500px">
      <h2 style="color:#1A1410">✅ Zoho connected successfully</h2>
      <p>Refresh token stored in Supabase. The inbox agent will now authenticate automatically.</p>
      <p style="color:#796A5E;font-size:14px">You can close this tab.</p>
    </body></html>
  `, { headers: { "Content-Type": "text/html" } })
}
