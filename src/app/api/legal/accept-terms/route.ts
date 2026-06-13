import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { LEGAL_VERSIONS } from "@/lib/legal-config"
import { recordLegalAcceptance } from "@/lib/legal/record-acceptance"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const bodySchema = z.object({
  docType: z.enum(["terms_of_service", "host_terms", "privacy_policy"]),
  version: z.string().optional(),
  ui_intent: z.enum(["guest", "host", "both"]).optional(),
  is_host: z.boolean().optional(),
})

/** Record legal acceptance (IP/UA) then update profile legal columns. */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const { docType } = parsed.data
  const now = new Date().toISOString()
  const admin = createAdminClient()

  const version =
    parsed.data.version ??
    (docType === "terms_of_service"
      ? LEGAL_VERSIONS.TERMS
      : docType === "host_terms"
        ? LEGAL_VERSIONS.HOST_AGREEMENT
        : LEGAL_VERSIONS.PRIVACY)

  await recordLegalAcceptance({
    admin,
    userId: user.id,
    docType,
    version,
    headers: req.headers,
  })

  const profileUpdate: Record<string, unknown> = {}
  if (docType === "terms_of_service") {
    profileUpdate.terms_accepted = true
    profileUpdate.terms_accepted_at = now
    profileUpdate.terms_version = version
    profileUpdate.privacy_version = LEGAL_VERSIONS.PRIVACY
  } else if (docType === "host_terms") {
    profileUpdate.host_terms_accepted = true
    profileUpdate.host_terms_accepted_at = now
    profileUpdate.host_terms_version = version
    if (parsed.data.ui_intent) profileUpdate.ui_intent = parsed.data.ui_intent
    if (parsed.data.is_host === true) profileUpdate.is_host = true
  } else if (docType === "privacy_policy") {
    profileUpdate.privacy_version = version
  }

  const { error } = await admin.from("profiles").update(profileUpdate).eq("id", user.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
