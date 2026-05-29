import { NextResponse } from "next/server"

import {
  assertHostInsuranceAttested,
  insuranceAttestationUpdatePayload,
} from "@/lib/host/insurance-attestation"
import { createClient } from "@/lib/supabase/server"

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await assertHostInsuranceAttested(supabase, user.id)
  if (existing.ok) {
    return NextResponse.json({ success: true, alreadyAttested: true })
  }

  const { error } = await supabase
    .from("profiles")
    .update(insuranceAttestationUpdatePayload())
    .eq("id", user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
