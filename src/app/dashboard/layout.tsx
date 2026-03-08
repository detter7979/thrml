import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { DashboardShell } from "@/components/dashboard/DashboardShell"
import { createClient } from "@/lib/supabase/server"

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login?next=/dashboard")

  const normalizeAvatarUrl = (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value : null)
  const normalizeName = (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null)
  const [{ count: listingCount }, { data: profileById }] = await Promise.all([
    supabase
      .from("listings")
      .select("*", { count: "exact", head: true })
      .eq("host_id", user.id)
      .eq("is_active", true),
    supabase
      .from("profiles")
      .select("full_name, avatar_url, ui_intent")
      .eq("id", user.id)
      .maybeSingle(),
  ])
  const { data: profileByUserId, error: profileByUserIdError } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, ui_intent")
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
      }
    : legacyProfile

  const name = normalizeName(profile?.full_name) ?? normalizeName(user.user_metadata.full_name) ?? user.email ?? "Member"

  return (
    <DashboardShell
      fullName={name}
      avatarUrl={normalizeAvatarUrl(profile?.avatar_url)}
      uiIntent={
        profile?.ui_intent === "host" || profile?.ui_intent === "both" || profile?.ui_intent === "guest"
          ? profile.ui_intent
          : "guest"
      }
      hasListings={Boolean((listingCount ?? 0) > 0)}
      activeListingsCount={Number(listingCount ?? 0)}
    >
      {children}
    </DashboardShell>
  )
}
