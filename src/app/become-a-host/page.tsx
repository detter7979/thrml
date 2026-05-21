import { Suspense } from "react"
import type { Metadata } from "next"

import { PlatformFeesProvider } from "@/contexts/platform-fees-context"
import { formatHostKeepPercent, getPlatformFeePercentsCached } from "@/lib/fees"
import { createAdminClient } from "@/lib/supabase/admin"

import { BecomeAHostClient } from "./become-a-host-client"

export async function generateMetadata(): Promise<Metadata> {
  const admin = createAdminClient()
  const { hostFeePercent } = await getPlatformFeePercentsCached(admin)
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
  const admin = createAdminClient()
  const feePercents = await getPlatformFeePercentsCached(admin)

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
