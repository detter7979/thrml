import { NextRequest, NextResponse } from "next/server"

import {
  assertHostInsuranceAttested,
  INSURANCE_ATTESTATION_VERSION,
  insuranceAttestationUpdatePayload,
} from "@/lib/host/insurance-attestation"
import { recordLegalAcceptance } from "@/lib/legal/record-acceptance"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await assertHostInsuranceAttested(supabase, user.id)
  if (existing.ok) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("insurance_attested_at")
      .eq("id", user.id)
      .maybeSingle()
    return NextResponse.json({
      success: true,
      alreadyAttested: true,
      attestedAt:
        typeof profile?.insurance_attested_at === "string" ? profile.insurance_attested_at : null,
    })
  }

  const admin = createAdminClient()
  await recordLegalAcceptance({
    admin,
    userId: user.id,
    docType: "insurance_attestation",
    version: INSURANCE_ATTESTATION_VERSION,
    headers: req.headers,
  })

  const { error } = await admin
    .from("profiles")
    .update(insuranceAttestationUpdatePayload())
    .eq("id", user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const attestedAt = new Date().toISOString()
  return NextResponse.json({ success: true, attestedAt })
}
