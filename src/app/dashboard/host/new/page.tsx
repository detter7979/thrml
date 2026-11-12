import { redirect } from "next/navigation"

import { hasCompletedHostOnboarding, HOST_SIGNUP_RETURN_PATH } from "@/lib/host/host-funnel"
import { getHostInsuranceAttestationStatus } from "@/lib/host/insurance-attestation"
import { createClient } from "@/lib/supabase/server"

import { HostNewListingClient, type ListingDraft } from "./host-new-listing-client"

export default async function NewHostListingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/")
  }

  const [{ data: profile }, insuranceAttestation, { count: activeListingCount }, { data: draftRow }] = await Promise.all([
    supabase.from("profiles").select("house_rules, host_terms_accepted").eq("id", user.id).maybeSingle(),
    getHostInsuranceAttestationStatus(supabase, user.id),
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("host_id", user.id)
      .eq("is_active", true),
    supabase
      .from("host_listing_drafts")
      .select("step, form, photo_urls")
      .eq("host_id", user.id)
      .maybeSingle(),
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

  const initialDraft: ListingDraft | null = draftRow
    ? {
        step: typeof draftRow.step === "number" ? draftRow.step : 1,
        form:
          draftRow.form && typeof draftRow.form === "object"
            ? (draftRow.form as ListingDraft["form"])
            : {},
        photoUrls: Array.isArray(draftRow.photo_urls)
          ? draftRow.photo_urls.filter((url: unknown): url is string => typeof url === "string")
          : [],
      }
    : null

  return (
    <HostNewListingClient
      initialDraft={initialDraft}
      userId={user.id}
      defaultHouseRules={defaultHouseRules}
      insuranceAttested={insuranceAttestation.attested}
      insuranceAttestedAt={insuranceAttestation.attestedAt}
    />
  )
}
