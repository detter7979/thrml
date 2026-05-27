"use client"

import { trackGaEvent } from "@/lib/analytics/ga"
import { gtagIfConsented } from "@/lib/analytics/gtag"
import { isAnalyticsConsented } from "@/lib/cookie-consent"

export function trackBecomeHostClick(destination: string, source = "nav") {
  trackGaEvent("become_host_click", { source, destination })
}

export function trackHostOnboardingComplete() {
  const label = process.env.NEXT_PUBLIC_GOOGLE_ADS_HOST_CONVERSION_LABEL
  if (!label) return

  const conversionId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "AW-18014799415"
  if (!conversionId) return

  if (!isAnalyticsConsented()) return

  gtagIfConsented("event", "conversion", {
    send_to: `${conversionId}/${label}`,
    transaction_id: `host_complete_${Date.now()}`,
    value: 50.0,
    currency: "USD",
  })
}
