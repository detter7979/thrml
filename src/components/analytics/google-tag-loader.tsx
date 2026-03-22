"use client"

import Script from "next/script"
import { useEffect, useState } from "react"

const CONSENT_KEY = "thrml_cookie_consent"
export const COOKIE_CONSENT_ACCEPTED_EVENT = "thrml-cookie-consent-accepted"

/**
 * Loads gtag / Google Ads + GA4 only after analytics cookies are accepted.
 * Cold visitors (and Lighthouse without accepting) never download googletagmanager.com.
 */
export function GoogleTagLoader() {
  const [enabled, setEnabled] = useState(false)
  const googleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "AW-18014799415"
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-L20J7S2M51"

  useEffect(() => {
    function readAccepted() {
      try {
        return localStorage.getItem(CONSENT_KEY) === "accepted"
      } catch {
        return false
      }
    }

    if (readAccepted()) setEnabled(true)

    function onAccepted() {
      if (readAccepted()) setEnabled(true)
    }

    function onStorage(event: StorageEvent) {
      if (event.key === CONSENT_KEY && event.newValue === "accepted") setEnabled(true)
    }

    window.addEventListener(COOKIE_CONSENT_ACCEPTED_EVENT, onAccepted)
    window.addEventListener("storage", onStorage)

    return () => {
      window.removeEventListener(COOKIE_CONSENT_ACCEPTED_EVENT, onAccepted)
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
