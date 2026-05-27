export const COOKIE_CONSENT_KEY = "thrml_cookie_consent"
export const COOKIE_CONSENT_ACCEPTED = "accepted"
export const COOKIE_CONSENT_DECLINED = "declined"
export const COOKIE_CONSENT_ACCEPTED_EVENT = "thrml-cookie-consent-accepted"
export const COOKIE_CONSENT_CHANGED_EVENT = "thrml-cookie-consent-changed"

const DEFAULT_GA_MEASUREMENT_ID = "G-L20J7S2M51"
const DEFAULT_GOOGLE_ADS_ID = "AW-18014799415"

export function getCookieConsent(): string | null {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(COOKIE_CONSENT_KEY)
  } catch {
    return null
  }
}

export function isAnalyticsConsented(): boolean {
  return getCookieConsent() === COOKIE_CONSENT_ACCEPTED
}

function getAnalyticsIds() {
  return {
    gaMeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? DEFAULT_GA_MEASUREMENT_ID,
    googleAdsId: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? DEFAULT_GOOGLE_ADS_ID,
  }
}

function getGtagFn(): (...args: unknown[]) => void {
  window.dataLayer = window.dataLayer || []
  return window.gtag ?? ((...args: unknown[]) => window.dataLayer?.push(args))
}

/** Google's documented kill-switch for a loaded gtag.js instance. */
function setGtagDisableFlags(disable: boolean) {
  const { gaMeasurementId, googleAdsId } = getAnalyticsIds()
  const win = window as Window & Record<string, boolean | undefined>
  win[`ga-disable-${gaMeasurementId}`] = disable ? true : undefined
  win[`ga-disable-${googleAdsId}`] = disable ? true : undefined
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

export function grantAnalyticsConsent() {
  if (typeof window === "undefined") return

  setGtagDisableFlags(false)
  const gtag = getGtagFn()
  gtag("consent", "update", {
    analytics_storage: "granted",
    ad_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "granted",
  })
}

/** Stops in-page GA/Meta after decline, including when gtag.js was already loaded. */
export function revokeAnalyticsConsent() {
  if (typeof window === "undefined") return

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
