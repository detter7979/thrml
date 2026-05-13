import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id_verification_status, id_verified, id_verified_at, stripe_identity_verification_id")
    .eq("id", user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    status: profile?.id_verification_status ?? "not_started",
    verified: Boolean(profile?.id_verified),
    verifiedAt: profile?.id_verified_at ?? null,
    sessionId: profile?.stripe_identity_verification_id ?? null,
  })
}
