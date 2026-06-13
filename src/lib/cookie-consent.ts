import {
  normalizeGaMeasurementId,
  normalizeGoogleAdsId,
} from "@/lib/analytics/env-ids"
import { setAdConsentCookie } from "@/lib/advertising-consent"

export const COOKIE_CONSENT_KEY = "thrml_cookie_consent"
export const COOKIE_CONSENT_ACCEPTED = "accepted"
export const COOKIE_CONSENT_DECLINED = "declined"
export const COOKIE_CONSENT_ACCEPTED_EVENT = "thrml-cookie-consent-accepted"
export const COOKIE_CONSENT_CHANGED_EVENT = "thrml-cookie-consent-changed"

export type CookieConsentValue = typeof COOKIE_CONSENT_ACCEPTED | typeof COOKIE_CONSENT_DECLINED

/** Ignore corrupted or legacy localStorage values so the banner can show again. */
export function parseCookieConsent(raw: string | null): CookieConsentValue | null {
  if (raw === COOKIE_CONSENT_ACCEPTED || raw === COOKIE_CONSENT_DECLINED) return raw
  return null
}

export function getCookieConsent(): CookieConsentValue | null {
  if (typeof window === "undefined") return null
  try {
    return parseCookieConsent(localStorage.getItem(COOKIE_CONSENT_KEY))
  } catch {
    return null
  }
}

export function isAnalyticsConsented(): boolean {
  return getCookieConsent() === COOKIE_CONSENT_ACCEPTED
}

function getAnalyticsIds(): { gaMeasurementId: string; googleAdsId: string } | null {
  const gaMeasurementId = normalizeGaMeasurementId(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID)
  const googleAdsId = normalizeGoogleAdsId(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID)
  if (!gaMeasurementId && !googleAdsId) return null
  return {
    gaMeasurementId: gaMeasurementId ?? "",
    googleAdsId: googleAdsId ?? "",
  }
}

function getGtagFn(): (...args: unknown[]) => void {
  window.dataLayer = window.dataLayer || []
  return window.gtag ?? ((...args: unknown[]) => window.dataLayer?.push(args))
}

/** Google's documented kill-switch for a loaded gtag.js instance. */
function setGtagDisableFlags(disable: boolean) {
  const ids = getAnalyticsIds()
  if (!ids) return
  const { gaMeasurementId, googleAdsId } = ids
  const win = window as Window & Record<string, boolean | undefined>
  if (gaMeasurementId) win[`ga-disable-${gaMeasurementId}`] = disable ? true : undefined
  if (googleAdsId) win[`ga-disable-${googleAdsId}`] = disable ? true : undefined
}

function expireCookie(name: string) {
  const expires = "expires=Thu, 01 Jan 1970 00:00:00 GMT"
  document.cookie = `${name}=; ${expires}; path=/;`
  const host = location.hostname
  if (host.includes(".")) {
    const domain = host.replace(/^www\./, "")
    document.cookie = `${name}=; ${expires}; path=/; domain=.${domain}`
    document.cookie = `${name}=; ${expires}; path=/; domain=${host}`
  }
}

function clearAnalyticsCookies() {
  const prefixes = ["_ga", "_gid", "_gat", "_gcl_", "_fbp", "_fbc"]
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim()
    if (!name) continue
    if (prefixes.some((prefix) => name.startsWith(prefix))) {
      expireCookie(name)
    }
  }
}

function revokeMetaPixel() {
  const fbq = (window as Window & { fbq?: (...args: unknown[]) => void }).fbq
  if (typeof fbq === "function") {
    try {
      fbq("consent", "revoke")
    } catch {
      // Pixel may not support consent API on older loads.
    }
  }
  ;(window as Window & { __thrmlMetaQueue?: unknown[] }).__thrmlMetaQueue = []
}

function grantMetaPixelConsent() {
  const fbq = (window as Window & { fbq?: (...args: unknown[]) => void }).fbq
  if (typeof fbq === "function") {
    try {
      fbq("consent", "grant")
    } catch {
      // Pixel may not be loaded yet.
    }
  }
}

function applyAnalyticsConsentLocal(accepted: boolean) {
  setAdConsentCookie(accepted)
  if (accepted) {
    setGtagDisableFlags(false)
    const gtag = getGtagFn()
    gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
    })
    grantMetaPixelConsent()
    return
  }
  setGtagDisableFlags(true)
  const gtag = getGtagFn()
  gtag("consent", "update", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  })
  revokeMetaPixel()
  clearAnalyticsCookies()
}

function persistAdvertisingConsent(accepted: boolean) {
  void fetch("/api/consent/advertising", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consented: accepted }),
  }).catch(() => undefined)
}

/** Restore consent state from storage on page load (no server sync). */
export function restoreAnalyticsConsentFromStorage(accepted: boolean) {
  if (typeof window === "undefined") return
  applyAnalyticsConsentLocal(accepted)
}

export function grantAnalyticsConsent() {
  if (typeof window === "undefined") return
  applyAnalyticsConsentLocal(true)
  persistAdvertisingConsent(true)
}

/** Stops in-page GA/Meta after decline, including when gtag.js was already loaded. */
export function revokeAnalyticsConsent() {
  if (typeof window === "undefined") return
  applyAnalyticsConsentLocal(false)
  persistAdvertisingConsent(false)
}

/** @deprecated Prefer grantAnalyticsConsent */
export function enableAnalyticsStorage() {
  grantAnalyticsConsent()
}

/** @deprecated Prefer revokeAnalyticsConsent */
export function disableAnalyticsStorage() {
  revokeAnalyticsConsent()
}

export function notifyConsentChanged(value: typeof COOKIE_CONSENT_ACCEPTED | typeof COOKIE_CONSENT_DECLINED) {
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: COOKIE_CONSENT_KEY,
      newValue: value,
    })
  )
  window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED_EVENT))
  if (value === COOKIE_CONSENT_ACCEPTED) {
    window.dispatchEvent(new Event(COOKIE_CONSENT_ACCEPTED_EVENT))
  }
}
