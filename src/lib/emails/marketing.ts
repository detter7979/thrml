import { createAdminClient } from "@/lib/supabase/admin"

import type { NotificationPreferenceKey } from "@/lib/notification-preferences"

type MarketingPreferenceKey = Extract<
  NotificationPreferenceKey,
  "marketing_wellness_tips" | "marketing_offers" | "marketing_product_updates"
>

// These are opt-in marketing preferences. Any campaign send must comply with CAN-SPAM and include unsubscribe links.
export async function getMarketingSubscribers(
  preference: MarketingPreferenceKey
): Promise<{ email: string; name: string }[]> {
  const admin = createAdminClient()
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, full_name")
    .contains("notification_preferences", { [preference]: true })

  if (error || !profiles?.length) return []

  const subscribers: { email: string; name: string }[] = []

  for (const profile of profiles) {
    const userId = typeof profile.id === "string" ? profile.id : ""
    if (!userId) continue
    const { data: authUser } = await admin.auth.admin.getUserById(userId)
    const email = authUser.user?.email
    if (!email) continue

    subscribers.push({
      email,
      name:
        typeof profile.full_name === "string" && profile.full_name.trim()
          ? profile.full_name.trim()
          : "Thrml Member",
    })
  }

  return subscribers
}
