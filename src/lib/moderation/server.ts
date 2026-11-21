import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/** True when either person has blocked the other. Uses the service-role client. */
export async function isBlockedBetween(admin: SupabaseClient, a: string, b: string): Promise<boolean> {
  if (!a || !b || a === b) return false
  const { data, error } = await admin
    .from("user_blocks")
    .select("blocker_id")
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
    .limit(1)
  if (error) return false
  return (data ?? []).length > 0
}

/** Where report alerts go: SUPPORT_EMAIL, or hello@ in production. */
export function moderationInbox(): string {
  const configured = process.env.SUPPORT_EMAIL?.trim()
  if (configured) return configured
  return process.env.NODE_ENV === "production" ? "hello@usethrml.com" : ""
}
