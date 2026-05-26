"use client"

import Script from "next/script"
import { useEffect, useState } from "react"

import {
  COOKIE_CONSENT_ACCEPTED_EVENT,
  COOKIE_CONSENT_CHANGED_EVENT,
  COOKIE_CONSENT_KEY,
  disableAnalyticsStorage,
  isAnalyticsConsented,
} from "@/lib/cookie-consent"

export { COOKIE_CONSENT_ACCEPTED_EVENT } from "@/lib/cookie-consent"

/**
 * Loads gtag / Google Ads + GA4 only after analytics cookies are accepted.
 * Cold visitors (and Lighthouse without accepting) never download googletagmanager.com.
 */
export function GoogleTagLoader() {
  const [enabled, setEnabled] = useState(false)
  const googleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "AW-18014799415"
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-L20J7S2M51"

  useEffect(() => {
    function syncConsent() {
      const accepted = isAnalyticsConsented()
      setEnabled(accepted)
      if (!accepted) {
        disableAnalyticsStorage()
      }
    }

    queueMicrotask(syncConsent)

    function onConsentChanged() {
      syncConsent()
    }

    function onStorage(event: StorageEvent) {
      if (event.key === COOKIE_CONSENT_KEY) {
        syncConsent()
      }
    }

    window.addEventListener(COOKIE_CONSENT_ACCEPTED_EVENT, onConsentChanged)
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, onConsentChanged)
    window.addEventListener("storage", onStorage)

    return () => {
      window.removeEventListener(COOKIE_CONSENT_ACCEPTED_EVENT, onConsentChanged)
      window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, onConsentChanged)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  if (!enabled) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${googleAdsId}`}
        strategy="lazyOnload"
      />
      <Script id="google-tag-init" strategy="lazyOnload">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('consent', 'update', { analytics_storage: 'granted' });
          gtag('config', '${googleAdsId}');
          gtag('config', '${gaMeasurementId}');
        `}
      </Script>
    </>
  )
}
