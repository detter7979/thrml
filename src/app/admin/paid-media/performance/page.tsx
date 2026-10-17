import { requireAdmin } from "@/lib/admin-guard"

import { PerformanceClient } from "./performance-client"

export const dynamic = "force-dynamic"

export default async function PaidMediaPerformancePage() {
  await requireAdmin()
  return (
    <div className="space-y-6 px-6 py-8">
      <div>
        <h1 className="font-serif text-3xl text-[#2A2118]">Paid media · Performance</h1>
        <p className="mt-1 text-sm text-[#6E5B49]">
          Meta + Google Ads joined with GA4 and thrml bookings by ad ID, named from the namer. Any date range; export
          straight to CSV for pivots.
        </p>
      </div>
      <PerformanceClient />
    </div>
  )
}
