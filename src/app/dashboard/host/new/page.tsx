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
    .select("house_rules, insurance_attested, insurance_attested_at")
    .eq("id", user.id)
    .single()
  const defaultHouseRules = Array.isArray(profile?.house_rules)
    ? profile.house_rules.filter((rule): rule is string => typeof rule === "string")
    : []

  return (
    <HostNewListingClient
      userId={user.id}
      defaultHouseRules={defaultHouseRules}
      insuranceAttested={Boolean(profile?.insurance_attested)}
      insuranceAttestedAt={
        typeof profile?.insurance_attested_at === "string" ? profile.insurance_attested_at : null
      }
    />
  )
}
