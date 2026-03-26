import type { SupabaseClient } from "@supabase/supabase-js"

/** Matches client WaiverModal: active template for service type, else `general`. */
export async function resolveActiveWaiverVersionForServiceType(
  supabase: SupabaseClient,
  serviceType: string
): Promise<string | null> {
  const normalizedType = serviceType.trim()
  if (normalizedType) {
    const { data, error } = await supabase
      .from("waiver_templates")
      .select("version")
      .eq("service_type", normalizedType)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error && data && typeof data.version === "string") {
      const v = data.version.trim()
      if (v) return v
    }
  }

  const { data: fallback } = await supabase
    .from("waiver_templates")
    .select("version")
    .eq("service_type", "general")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fallback && typeof fallback.version === "string") {
    const v = fallback.version.trim()
    return v || null
  }
  return null
}

export function mergeBookingLegalException(
  existing: unknown,
  exception: Record<string, unknown>
): Record<string, unknown> {
  const prev =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {}
  const list = Array.isArray(prev.legal_exceptions) ? [...(prev.legal_exceptions as unknown[])] : []
  list.push({
    ...exception,
    logged_at: new Date().toISOString(),
  })
  return { ...prev, legal_exceptions: list }
}
