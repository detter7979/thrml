import type { SupabaseClient } from "@supabase/supabase-js"

import { getClientIpFromHeaders } from "@/lib/meta-capi"

export type LegalDocType =
  | "terms_of_service"
  | "privacy_policy"
  | "host_terms"
  | "insurance_attestation"
  | "session_waiver"
  | "device_disclosure"
  | "consumer_health_data_policy"

type RecordAcceptanceInput = {
  admin: SupabaseClient
  userId?: string | null
  bookingId?: string | null
  docType: LegalDocType
  version: string
  headers?: Headers
  ipAddress?: string | null
  userAgent?: string | null
}

/** Primary acceptance log — captures IP/UA before profile/booking update. */
export async function recordLegalAcceptance({
  admin,
  userId,
  bookingId,
  docType,
  version,
  headers,
  ipAddress,
  userAgent,
}: RecordAcceptanceInput): Promise<void> {
  const ip =
    ipAddress?.trim() ||
    (headers ? getClientIpFromHeaders(headers) : undefined) ||
    null
  const ua = userAgent?.trim() || headers?.get("user-agent")?.trim() || null

  const { error } = await admin.from("legal_acceptances").insert({
    user_id: userId ?? null,
    booking_id: bookingId ?? null,
    doc_type: docType,
    version,
    source: "app",
    ip_address: ip,
    user_agent: ua,
  })

  if (error) {
    console.error("[legal_acceptances] insert failed", docType, error.message)
  }
}
