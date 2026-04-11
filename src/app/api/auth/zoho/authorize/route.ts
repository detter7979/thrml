import { NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Step 1: Redirect to Zoho OAuth consent screen.
 * Visit in browser: GET https://usethrml.com/api/auth/zoho/authorize?secret=YOUR_CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.ZOHO_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: "ZOHO_CLIENT_ID not set" }, { status: 500 })

  const url = new URL(req.url)
  if (url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const redirectUri = `${url.origin}/api/auth/zoho/callback`
  const authUrl = new URL("https://accounts.zoho.com/oauth/v2/auth")
  authUrl.searchParams.set("scope", "ZohoMail.messages.ALL,ZohoMail.accounts.READ")
  authUrl.searchParams.set("client_id", clientId)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("access_type", "offline")
  authUrl.searchParams.set("prompt", "consent") // forces Zoho to re-issue refresh_token
  authUrl.searchParams.set("redirect_uri", redirectUri)

  return NextResponse.redirect(authUrl.toString())
}
