import { redirect } from "next/navigation"

import { hasCompletedHostOnboarding, HOST_SIGNUP_RETURN_PATH } from "@/lib/host/host-funnel"
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

  const [{ data: profile }, insuranceAttestation, { count: activeListingCount }] = await Promise.all([
    supabase.from("profiles").select("house_rules, host_terms_accepted").eq("id", user.id).maybeSingle(),
    getHostInsuranceAttestationStatus(supabase, user.id),
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("host_id", user.id)
      .eq("is_active", true),
  ])

  // New hosts accept the ground rules + host agreement on /become-a-host before listing.
  if (
    !hasCompletedHostOnboarding({
      activeListingCount: activeListingCount ?? 0,
      hostTermsAccepted: profile?.host_terms_accepted,
    })
  ) {
    redirect(HOST_SIGNUP_RETURN_PATH)
  }
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
