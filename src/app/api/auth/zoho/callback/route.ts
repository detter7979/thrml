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

  if (tokens.error || !tokens.access_token) {
    return NextResponse.json({ error: `Token exchange failed: ${JSON.stringify(tokens)}` }, { status: 500 })
  }

  const admin = createAdminClient()
  const expiry = Date.now() + (tokens.expires_in ?? 3600) * 1000

  // Always store the access token
  const upsertRows: { key: string; value: unknown }[] = [
    { key: "zoho_access_token", value: tokens.access_token },
    { key: "zoho_token_expiry", value: String(expiry) },
  ]

  // Only store refresh_token if Zoho returned one (first auth or forced re-consent)
  if (tokens.refresh_token) {
    upsertRows.push({ key: "zoho_refresh_token", value: tokens.refresh_token })
  }

  await admin.from("platform_settings").upsert(upsertRows, { onConflict: "key" })

  const hasRefresh = !!tokens.refresh_token
  return new NextResponse(`
    <html><body style="font-family:system-ui;padding:40px;max-width:500px">
      <h2 style="color:#1A1410">${hasRefresh ? "✅ Zoho fully connected" : "⚠️ Partial connection — re-consent needed"}</h2>
      ${hasRefresh
        ? "<p>Refresh token stored. The inbox agent will authenticate automatically going forward.</p>"
        : `<p style="color:#C0392B">Zoho did not return a refresh token — this happens when you've already authorized before.</p>
           <p><strong>To fix:</strong><br>
           1. Go to <a href="https://accounts.zoho.com/apiauthtoken/nb/create">accounts.zoho.com</a> → My Account → Connected Apps<br>
           2. Find and revoke "Claude" or your app name<br>
           3. Then <a href="/api/auth/zoho/authorize?secret=${code ? "USE_YOUR_CRON_SECRET" : ""}">re-authorize here</a></p>`
      }
      <p style="color:#796A5E;font-size:13px">You can close this tab.</p>
    </body></html>
  `, { headers: { "Content-Type": "text/html" } })
}
