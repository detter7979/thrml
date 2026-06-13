import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { adConsentCookieValue, AD_CONSENT_COOKIE } from "@/lib/advertising-consent"
import { createClient } from "@/lib/supabase/server"

const bodySchema = z.object({
  consented: z.boolean(),
})

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const now = new Date().toISOString()
    await supabase
      .from("profiles")
      .update({
        marketing_consent: parsed.data.consented,
        marketing_consent_at: now,
      })
      .eq("id", user.id)
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(AD_CONSENT_COOKIE, adConsentCookieValue(parsed.data.consented), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  })
  return response
}
