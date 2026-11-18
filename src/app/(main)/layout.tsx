import type { ReactNode } from "react"

import { DeferredMainWithMotion } from "@/components/layout/deferred-motion-boundaries"
import { SiteFooter } from "@/components/shared/SiteFooter"
import { PlatformFeesProvider } from "@/contexts/platform-fees-context"
import { getPlatformFeePercentsCached } from "@/lib/fees-server"
import { Navbar } from "@/components/shared/Navbar"

/** Shared shell for public marketing pages — fee percents are ISR-cached, not per-request. */
export const revalidate = 3600

export default async function MainLayout({ children }: { children: ReactNode }) {
  const feePercents = await getPlatformFeePercentsCached()

  // Room for the phone tab bar only when it is showing (signed in); otherwise the last section
  // runs to the bottom of the screen instead of ending above a blank cream band.
  return (
    <div className="min-h-screen bg-warm-50 max-md:has-[[data-app-tab-bar]]:pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
      <Navbar />
      <PlatformFeesProvider initialPercents={feePercents}>
        {/* At least a full screen tall, so the footer always starts below the fold (matches admin + dashboard). */}
        <main id="main-content" className="min-h-[100svh] min-w-0 overflow-x-hidden">
          <DeferredMainWithMotion>{children}</DeferredMainWithMotion>
        </main>
      </PlatformFeesProvider>
      <SiteFooter />
    </div>
  )
}

