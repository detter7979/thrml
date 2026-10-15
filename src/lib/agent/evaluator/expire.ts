import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Mark PENDING recommendations EXPIRED once they pass their expires_at, or (for rows created
 * before expires_at was set) once they are older than `expiryHours`. Stale recommendations
 * were piling up for months and also blocked fresh proposals for the same target in dedupe.
 */
export async function expireStaleRecommendations(admin: SupabaseClient, expiryHours: number): Promise<number> {
  const now = new Date()
  const cutoff = new Date(now.getTime() - expiryHours * 3_600_000).toISOString()

  const byDeadline = await admin
    .from("recommendations")
    .update({ status: "EXPIRED", updated_at: now.toISOString() })
    .eq("status", "PENDING")
    .not("expires_at", "is", null)
    .lt("expires_at", now.toISOString())
    .select("id")
  if (byDeadline.error) throw new Error(`expire recommendations: ${byDeadline.error.message}`)

  const byAge = await admin
    .from("recommendations")
    .update({ status: "EXPIRED", updated_at: now.toISOString() })
    .eq("status", "PENDING")
    .is("expires_at", null)
    .lt("created_at", cutoff)
    .select("id")
  if (byAge.error) throw new Error(`expire recommendations: ${byAge.error.message}`)

  return (byDeadline.data?.length ?? 0) + (byAge.data?.length ?? 0)
}
