import type { SupabaseClient } from "@supabase/supabase-js"

/** Minimum days between weekly listing digest sends to the same subscriber. */
export const WEEKLY_DIGEST_COOLDOWN_DAYS = 7

export function weeklyDigestCooldownMs(): number {
  return WEEKLY_DIGEST_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
}

export function isWeeklyDigestDue(
  lastSentAt: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!lastSentAt) return true
  const last = new Date(lastSentAt).getTime()
  if (!Number.isFinite(last)) return true
  return nowMs - last >= weeklyDigestCooldownMs()
}

export async function loadActiveNewsletterEmails(admin: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await admin.from("newsletter_subscribers").select("email").eq("is_active", true)

  if (error) {
    console.error("[newsletter-digest] subscriber email load failed", error.message)
    return new Set()
  }

  return new Set(
    (data ?? [])
      .map((row) => (typeof row.email === "string" ? row.email.trim().toLowerCase() : ""))
      .filter(Boolean)
  )
}
