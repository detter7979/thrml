"use client"

import { trackGaEvent } from "@/lib/analytics/ga"

export function trackBecomeHostClick(destination: string, source = "nav") {
  trackGaEvent("become_host_click", { source, destination })
}

export function trackHostOnboardingComplete() {
  const label = process.env.NEXT_PUBLIC_GOOGLE_ADS_HOST_CONVERSION_LABEL
  if (!label) return

  const conversionId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "AW-18014799415"
  if (!conversionId) return

  if (typeof window !== "undefined" && (window as { gtag?: (...args: unknown[]) => void }).gtag) {
    ;(window as { gtag: (...args: unknown[]) => void }).gtag("event", "conversion", {
      send_to: `${conversionId}/${label}`,
      transaction_id: `host_complete_${Date.now()}`,
      value: 50.0,
      currency: "USD",
    })
  }
}
