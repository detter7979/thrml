import { Suspense } from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { PlatformFeesProvider } from "@/contexts/platform-fees-context"
import { formatHostKeepPercent } from "@/lib/fees"
import { getPlatformFeePercentsCached } from "@/lib/fees-server"
import { fetchFoundingHostSettings, foundingSpotsRemaining } from "@/lib/host/founding-host"
import { guestBookingsOpen, hasCompletedHostOnboarding } from "@/lib/host/host-funnel"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSaunasOnlyLaunch } from "@/lib/launch-config"
import { HOST_NEW_LISTING_PATH } from "@/lib/host/is-host-user"
import { createClient } from "@/lib/supabase/server"

import { BecomeAHostClient } from "./become-a-host-client"

export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const { hostFeePercent } = await getPlatformFeePercentsCached()
  const hostKeep = formatHostKeepPercent(hostFeePercent)

  return {
    title: "Become a Host — List Your Wellness Space",
    description: `Earn passive income by listing your private sauna, cold plunge, or wellness space on thrml. Free to list. You keep ${hostKeep}.`,
    alternates: { canonical: "https://usethrml.com/become-a-host" },
    openGraph: {
      type: "website",
      title: "Become a thrml Host",
      description: "List your private wellness space and start earning. Free to list.",
      url: "https://usethrml.com/become-a-host",
    },
  }
}

export default async function BecomeAHostPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const [{ count: listingCount }, { data: profile }] = await Promise.all([
      supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("host_id", user.id)
        .eq("is_active", true),
      supabase.from("profiles").select("host_terms_accepted").eq("id", user.id).maybeSingle(),
    ])

    if (
      hasCompletedHostOnboarding({
        activeListingCount: listingCount ?? 0,
        hostTermsAccepted: profile?.host_terms_accepted,
      })
    ) {
      redirect(HOST_NEW_LISTING_PATH)
    }
  }

  const feePercents = await getPlatformFeePercentsCached()

  // Founding host offer (pre-launch only, while spots remain).
  let foundingOffer: { feePercent: number; windowDays: number; spotsLeft: number; cap: number } | null = null
  if (!guestBookingsOpen()) {
    try {
      const admin = createAdminClient()
      const settings = await fetchFoundingHostSettings(admin)
      const spotsLeft = await foundingSpotsRemaining(admin, settings.cap)
      if (spotsLeft > 0 && settings.feePercent < feePercents.hostFeePercent) {
        foundingOffer = { ...settings, spotsLeft }
      }
    } catch {
      foundingOffer = null
    }
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-neutral-400">
          Loading...
        </div>
      }
    >
      <PlatformFeesProvider initialPercents={feePercents}>
        <BecomeAHostClient
        guestBookingsOpen={guestBookingsOpen()}
        saunasOnly={isSaunasOnlyLaunch()}
        foundingOffer={foundingOffer}
      />
      </PlatformFeesProvider>
    </Suspense>
  )
}
