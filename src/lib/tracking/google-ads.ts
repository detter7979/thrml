"use client"

import { trackGaEvent } from "@/lib/analytics/ga"
import { getGtag } from "@/lib/analytics/gtag"

export function trackBecomeHostClick(destination: string, source = "nav") {
  trackGaEvent("become_host_click", { source, destination })
}

export function trackHostOnboardingComplete() {
  const label = process.env.NEXT_PUBLIC_GOOGLE_ADS_HOST_CONVERSION_LABEL
  if (!label) return

  const conversionId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "AW-18014799415"
  if (!conversionId) return

  const gtag = getGtag()
  if (gtag) {
    gtag("event", "conversion", {
      send_to: `${conversionId}/${label}`,
      transaction_id: `host_complete_${Date.now()}`,
      value: 50.0,
      currency: "USD",
    })
  }
}
