import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { HostNewListingClient } from "./host-new-listing-client"

export default async function NewHostListingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_account_id, stripe_onboarding_complete, house_rules")
    .eq("id", user.id)
    .single()
  const isMockHost = profile?.stripe_account_id?.startsWith("acct_mock_")
  const defaultHouseRules = Array.isArray(profile?.house_rules)
    ? profile.house_rules.filter((rule): rule is string => typeof rule === "string")
    : []

  return (
    <HostNewListingClient
      userId={user.id}
      stripeConnected={Boolean(isMockHost || profile?.stripe_onboarding_complete)}
      hasStripeAccount={Boolean(profile?.stripe_account_id)}
      defaultHouseRules={defaultHouseRules}
    />
  )
}
