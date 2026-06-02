import { NextResponse } from "next/server"

import { createVerificationSession } from "@/lib/stripe-identity"
import { createClient } from "@/lib/supabase/server"

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    "http://localhost:3000"
  )
}

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const returnUrl = `${appBaseUrl()}/dashboard/account?identity=complete`

  try {
    const { url, sessionId } = await createVerificationSession(user.id, returnUrl)
    const { error } = await supabase
      .from("profiles")
      .update({
        stripe_identity_verification_id: sessionId,
        id_verification_status: "pending",
        id_verification_started_at: new Date().toISOString(),
      })
      .eq("id", user.id)

    if (error) {
      console.error("[identity/start] profile update failed", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ url })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    console.error("[identity/start]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
