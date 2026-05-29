import type { SupabaseClient } from "@supabase/supabase-js"

export const INSURANCE_ATTESTATION_VERSION = "v1-2026-05"

export const INSURANCE_ATTESTATION_LABEL =
  "I confirm that I carry liability insurance appropriate for hosting paid guests at this space, and I understand that thrml may request proof of coverage at any time. I will keep my coverage in place while my listing is active."

export const INSURANCE_ATTESTATION_HELPER =
  "Most standard homeowners or renters policies include some liability coverage. If you're hosting commercially, you may need a separate commercial policy. We recommend consulting an insurance professional."

export const INSURANCE_ATTESTATION_BLOCK_MESSAGE =
  "Please complete the host insurance attestation in your account settings"

export function insuranceAttestationUpdatePayload() {
  return {
    insurance_attested: true,
    insurance_attested_at: new Date().toISOString(),
    insurance_attestation_version: INSURANCE_ATTESTATION_VERSION,
  }
}

export async function assertHostInsuranceAttested(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("insurance_attested")
    .eq("id", userId)
    .maybeSingle()

  if (error || !data?.insurance_attested) {
    return { ok: false, error: INSURANCE_ATTESTATION_BLOCK_MESSAGE }
  }

  return { ok: true }
}
