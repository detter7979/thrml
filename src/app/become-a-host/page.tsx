import { Suspense } from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { PlatformFeesProvider } from "@/contexts/platform-fees-context"
import { formatHostKeepPercent } from "@/lib/fees"
import { getPlatformFeePercentsCached } from "@/lib/fees-server"
import { HOST_NEW_LISTING_PATH, isHostUser } from "@/lib/host/is-host-user"
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
        .select("*", { count: "exact", head: true })
        .eq("host_id", user.id)
        .eq("is_active", true),
      supabase.from("profiles").select("ui_intent").eq("id", user.id).maybeSingle(),
    ])

    if (
      isHostUser({
        activeListingCount: listingCount ?? 0,
        uiIntent: profile?.ui_intent,
      })
    ) {
      redirect(HOST_NEW_LISTING_PATH)
    }
  }

  const feePercents = await getPlatformFeePercentsCached()

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-neutral-400">
          Loading...
        </div>
      }
    >
      <PlatformFeesProvider initialPercents={feePercents}>
        <BecomeAHostClient />
      </PlatformFeesProvider>
    </Suspense>
  )
}
