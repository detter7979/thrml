import type { SupabaseClient } from "@supabase/supabase-js"

export const INSURANCE_ATTESTATION_VERSION = "v1-2026-05"

export const INSURANCE_ATTESTATION_LABEL =
  "I confirm that I carry liability insurance appropriate for hosting paid guests at this space, and I understand that thrml may request proof of coverage at any time. I will keep my coverage in place while my listing is active."

export const INSURANCE_ATTESTATION_HELPER =
  "Most standard homeowners or renters policies include some liability coverage. If you're hosting commercially, you may need a separate commercial policy. We recommend consulting an insurance professional."

export const INSURANCE_ATTESTATION_BLOCK_MESSAGE =
  "Please complete the host insurance attestation in your account settings"

const INSURANCE_ATTESTATION_COLUMNS = "insurance_attested, insurance_attested_at"

function isMissingUserIdColumn(message?: string) {
  return Boolean(message?.includes("column profiles.user_id does not exist"))
}

export function insuranceAttestationUpdatePayload() {
  return {
    insurance_attested: true,
    insurance_attested_at: new Date().toISOString(),
    insurance_attestation_version: INSURANCE_ATTESTATION_VERSION,
  }
}

export async function getHostInsuranceAttestationStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<{ attested: boolean; attestedAt: string | null }> {
  const { data: byId } = await supabase
    .from("profiles")
    .select(INSURANCE_ATTESTATION_COLUMNS)
    .eq("id", userId)
    .maybeSingle()

  const { data: byUserId, error: byUserIdError } = await supabase
    .from("profiles")
    .select(INSURANCE_ATTESTATION_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle()

  const legacyRow = isMissingUserIdColumn(byUserIdError?.message) ? null : byUserId
  const row = byId?.insurance_attested ? byId : legacyRow?.insurance_attested ? legacyRow : byId ?? legacyRow

  return {
    attested: Boolean(row?.insurance_attested),
    attestedAt: typeof row?.insurance_attested_at === "string" ? row.insurance_attested_at : null,
  }
}

export async function assertHostInsuranceAttested(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const status = await getHostInsuranceAttestationStatus(supabase, userId)
  if (!status.attested) {
    return { ok: false, error: INSURANCE_ATTESTATION_BLOCK_MESSAGE }
  }

  return { ok: true }
}

export async function persistHostInsuranceAttestation(
  admin: SupabaseClient,
  userId: string
): Promise<{ attestedAt: string }> {
  const payload = insuranceAttestationUpdatePayload()
  const fallbackAttestedAt = payload.insurance_attested_at

  const { data: updatedById, error: updateByIdError } = await admin
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select(INSURANCE_ATTESTATION_COLUMNS)
    .maybeSingle()

  if (!updateByIdError && updatedById?.insurance_attested) {
    return {
      attestedAt:
        typeof updatedById.insurance_attested_at === "string"
          ? updatedById.insurance_attested_at
          : fallbackAttestedAt,
    }
  }

  const { data: updatedByUserId, error: updateByUserIdError } = await admin
    .from("profiles")
    .update(payload)
    .eq("user_id", userId)
    .select(INSURANCE_ATTESTATION_COLUMNS)
    .maybeSingle()

  if (
    !isMissingUserIdColumn(updateByUserIdError?.message) &&
    !updateByUserIdError &&
    updatedByUserId?.insurance_attested
  ) {
    return {
      attestedAt:
        typeof updatedByUserId.insurance_attested_at === "string"
          ? updatedByUserId.insurance_attested_at
          : fallbackAttestedAt,
    }
  }

  const { data: upserted, error: upsertError } = await admin
    .from("profiles")
    .upsert({ id: userId, ...payload }, { onConflict: "id" })
    .select(INSURANCE_ATTESTATION_COLUMNS)
    .maybeSingle()

  if (upsertError || !upserted?.insurance_attested) {
    const message =
      upsertError?.message ??
      updateByIdError?.message ??
      updateByUserIdError?.message ??
      "Unable to save insurance attestation."
    throw new Error(message)
  }

  return {
    attestedAt:
      typeof upserted.insurance_attested_at === "string"
        ? upserted.insurance_attested_at
        : fallbackAttestedAt,
  }
}
