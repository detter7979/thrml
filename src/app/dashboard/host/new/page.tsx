import { redirect } from "next/navigation"

import { getHostInsuranceAttestationStatus } from "@/lib/host/insurance-attestation"
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

  const [{ data: profile }, insuranceAttestation] = await Promise.all([
    supabase.from("profiles").select("house_rules").eq("id", user.id).maybeSingle(),
    getHostInsuranceAttestationStatus(supabase, user.id),
  ])
  const defaultHouseRules = Array.isArray(profile?.house_rules)
    ? profile.house_rules.filter((rule): rule is string => typeof rule === "string")
    : []

  return (
    <HostNewListingClient
      userId={user.id}
      defaultHouseRules={defaultHouseRules}
      insuranceAttested={insuranceAttestation.attested}
      insuranceAttestedAt={insuranceAttestation.attestedAt}
    />
  )
}
