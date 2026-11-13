"use client"

import { gtagIfConsented } from "@/lib/analytics/gtag"

/**
 * Send a GA4 event through the site's own gtag (loaded by GoogleTagLoader once analytics consent is given).
 *
 * Previously this used `sendGAEvent` from @next/third-parties, which only works when that package's
 * <GoogleAnalytics> component is mounted. The site loads gtag itself, so every call logged
 * "GA has not been initialized" and no custom event (sign_up, become_host_click, purchase, …) reached GA4.
 */
export function trackGaEvent(eventName: string, params: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV !== "production") return
  gtagIfConsented("event", eventName, params)
}
