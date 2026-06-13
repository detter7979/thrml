"use client"

import Link from "next/link"
import { useState } from "react"
import { CheckCircle2 } from "lucide-react"

import { IdentityVerificationCTA, type IdentityUiStatus } from "@/components/profile/IdentityVerificationCTA"
import { StripeConnectBanner } from "@/components/host/StripeConnectBanner"
import { Button } from "@/components/ui/button"

type HostListingNextStepsProps = {
  listingJustCreated?: boolean
  hasListings: boolean
  idVerificationStatus: string | null
  idVerified: boolean
  idVerifiedAt: string | null
  payoutsConnected: boolean
  stripeOnboardingComplete: boolean
  insuranceAttested: boolean
  insuranceAttestedAt: string | null
}

export function HostListingNextSteps({
  listingJustCreated = false,
  hasListings,
  idVerificationStatus,
  idVerified,
  idVerifiedAt,
  payoutsConnected,
  stripeOnboardingComplete,
  insuranceAttested,
  insuranceAttestedAt,
}: HostListingNextStepsProps) {
  const [dismissed, setDismissed] = useState(false)

  const needsIdentity = !idVerified
  const needsPayouts = !payoutsConnected
  const needsAttestation = !insuranceAttested
  const hasSetupWork = needsIdentity || needsPayouts || needsAttestation

  if (!hasListings && !listingJustCreated) return null
  if (!listingJustCreated && !hasSetupWork) return null
  if (dismissed && !listingJustCreated) return null

  function handleDismiss() {
    setDismissed(true)
    if (listingJustCreated && typeof window !== "undefined") {
      const nextUrl = new URL(window.location.href)
      nextUrl.searchParams.delete("created")
      window.history.replaceState({}, "", nextUrl.toString())
    }
  }

  return (
    <section className="rounded-2xl border border-[#E7DED3] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          {listingJustCreated ? (
            <p className="flex items-center gap-2 text-sm font-medium text-[#166534]">
              <CheckCircle2 className="size-4 shrink-0" />
              Your listing is saved
            </p>
          ) : null}
          <h2 className="font-serif text-xl text-[#1A1410]">
            {listingJustCreated ? "Optional next steps" : "Finish host setup"}
          </h2>
          <p className="text-sm leading-relaxed text-[#6D5E51]">
            {listingJustCreated
              ? "Your space is ready to edit and activate. Verify your identity and connect payouts when you are ready — neither blocks saving your listing."
              : "Complete these when you are ready to build trust and receive payouts. You can still edit and activate listings in the meantime."}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 text-[#7A6A5D]" onClick={handleDismiss}>
          {listingJustCreated ? "Got it" : "Dismiss"}
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {needsAttestation ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Complete your{" "}
            <Link href="/dashboard/account#insurance-attestation" className="font-medium underline underline-offset-2">
              insurance attestation
            </Link>{" "}
            before publishing or reactivating a listing.
          </p>
        ) : (
          <p className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-sm font-medium text-[#166534]">
            ✓ Attestation accepted — approved to create listings
            {insuranceAttestedAt
              ? ` · confirmed ${new Date(insuranceAttestedAt).toLocaleDateString()}`
              : ""}
          </p>
        )}
        {needsIdentity ? (
          <IdentityVerificationCTA
            status={(idVerificationStatus ?? null) as IdentityUiStatus}
            verified={idVerified}
            verifiedAt={idVerifiedAt}
            compact
          />
        ) : (
          <p className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-sm font-medium text-[#166534]">
            ✓ Identity verified — Verified Host badge is on your profile and listings
          </p>
        )}
        {needsPayouts ? (
          <StripeConnectBanner compact payoutsActive={stripeOnboardingComplete} />
        ) : (
          <p className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-sm font-medium text-[#166534]">
            ✓ Payouts connected
          </p>
        )}
      </div>
    </section>
  )
}
