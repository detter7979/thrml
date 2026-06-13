import { NextRequest, NextResponse } from "next/server"

import {
  assertHostInsuranceAttested,
  getHostInsuranceAttestationStatus,
  INSURANCE_ATTESTATION_VERSION,
  persistHostInsuranceAttestation,
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
    const status = await getHostInsuranceAttestationStatus(supabase, user.id)
    return NextResponse.json({
      success: true,
      alreadyAttested: true,
      attestedAt: status.attestedAt,
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

  try {
    const { attestedAt } = await persistHostInsuranceAttestation(admin, user.id)
    return NextResponse.json({ success: true, attestedAt })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save insurance attestation." },
      { status: 500 }
    )
  }
}
