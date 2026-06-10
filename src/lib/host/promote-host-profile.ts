import type { SupabaseClient } from "@supabase/supabase-js"

/** Guest signups who start hosting become `both`; existing host intent is preserved. */
export function nextHostUiIntent(current?: string | null): "host" | "both" {
  return current === "host" ? "host" : "both"
}

/** Mark profile as a host (ui_intent + is_host). Idempotent — safe to call more than once. */
export async function promoteProfileToHost(
  client: SupabaseClient,
  userId: string
): Promise<void> {
  const { data: profile } = await client
    .from("profiles")
    .select("ui_intent")
    .eq("id", userId)
    .maybeSingle()

  const ui_intent = nextHostUiIntent(
    typeof profile?.ui_intent === "string" ? profile.ui_intent : null
  )

  const { error } = await client
    .from("profiles")
    .update({ ui_intent, is_host: true })
    .eq("id", userId)

  if (error) {
    console.error("[promoteProfileToHost] profile update failed", { userId, message: error.message })
  }
}
