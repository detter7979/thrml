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

  return (
    <div className="min-h-screen bg-warm-50">
      <Navbar />
      <PlatformFeesProvider initialPercents={feePercents}>
        <main id="main-content" className="min-w-0 overflow-x-hidden">
          <DeferredMainWithMotion>{children}</DeferredMainWithMotion>
        </main>
      </PlatformFeesProvider>
      <SiteFooter />
    </div>
  )
}

