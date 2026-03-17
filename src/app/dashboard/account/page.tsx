import { redirect } from "next/navigation"

import { normalizeNotificationPreferences } from "@/lib/notification-preferences"
import { createClient } from "@/lib/supabase/server"

import { AccountClient } from "./account-client"

export default async function DashboardAccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/dashboard/account")

  const normalizeAvatarUrl = (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value : null)
  const normalizeName = (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null)
  const profileColumns =
    "full_name, first_name, last_name, avatar_url, phone, phone_verified, bio, house_rules, ui_intent, stripe_account_id, stripe_onboarding_complete, stripe_payouts_enabled, stripe_charges_enabled, newsletter_opted_in, offers_opted_in, product_updates_opted_in, notification_preferences"
  const [{ count: listingCount }, { data: profileById }] = await Promise.all([
    supabase.from("listings").select("*", { count: "exact", head: true }).eq("host_id", user.id),
    supabase.from("profiles").select(profileColumns).eq("id", user.id).maybeSingle(),
  ])
  const { data: profileByUserId, error: profileByUserIdError } = await supabase
    .from("profiles")
    .select(profileColumns)
    .eq("user_id", user.id)
    .maybeSingle()
  const hasUserIdColumn =
    !profileByUserIdError || !profileByUserIdError.message?.includes("column profiles.user_id does not exist")
  const legacyProfile = hasUserIdColumn ? profileByUserId : null
  const profile = profileById
    ? {
        ...legacyProfile,
        ...profileById,
        full_name: normalizeName(profileById.full_name) ?? normalizeName(legacyProfile?.full_name),
        avatar_url: profileById.avatar_url ?? legacyProfile?.avatar_url ?? null,
        phone: profileById.phone ?? legacyProfile?.phone ?? null,
        bio: profileById.bio ?? legacyProfile?.bio ?? null,
        house_rules: profileById.house_rules ?? legacyProfile?.house_rules ?? [],
      }
    : legacyProfile
  const isMockHost = profile?.stripe_account_id?.startsWith("acct_mock_")
  const houseRules = Array.isArray(profile?.house_rules)
    ? profile.house_rules.filter((rule): rule is string => typeof rule === "string")
    : []
  const hostingEnabled =
    Boolean((listingCount ?? 0) > 0) ||
    profile?.ui_intent === "host" ||
    profile?.ui_intent === "both"
  const notificationPreferences = normalizeNotificationPreferences(profile?.notification_preferences)

  return (
    <AccountClient
      userId={user.id}
      fullName={normalizeName(profile?.full_name) ?? normalizeName(user.user_metadata.full_name) ?? "Member"}
      firstName={typeof profile?.first_name === "string" ? profile.first_name : null}
      lastName={typeof profile?.last_name === "string" ? profile.last_name : null}
      email={user.email ?? ""}
      avatarUrl={normalizeAvatarUrl(profile?.avatar_url)}
      phone={profile?.phone ?? null}
      phoneVerified={Boolean(profile?.phone_verified)}
      bio={profile?.bio ?? null}
      houseRules={houseRules}
      stripeAccountId={profile?.stripe_account_id ?? null}
      stripeOnboardingComplete={Boolean(isMockHost || profile?.stripe_onboarding_complete)}
      stripePayoutsEnabled={Boolean(isMockHost || profile?.stripe_payouts_enabled)}
      stripeChargesEnabled={Boolean(isMockHost || profile?.stripe_charges_enabled)}
      hostingEnabled={hostingEnabled}
      notificationPreferences={notificationPreferences}
    />
  )
}
