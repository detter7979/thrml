export const COOKIE_CONSENT_KEY = "thrml_cookie_consent"
export const COOKIE_CONSENT_ACCEPTED = "accepted"
export const COOKIE_CONSENT_DECLINED = "declined"
export const COOKIE_CONSENT_ACCEPTED_EVENT = "thrml-cookie-consent-accepted"
export const COOKIE_CONSENT_CHANGED_EVENT = "thrml-cookie-consent-changed"

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

export function enableAnalyticsStorage() {
  if (typeof window === "undefined") return

  window.dataLayer = window.dataLayer || []
  const gtag = window.gtag ?? ((...args: unknown[]) => window.dataLayer?.push(args))
  gtag("consent", "update", {
    analytics_storage: "granted",
  })
}

export function disableAnalyticsStorage() {
  if (typeof window === "undefined") return

  window.dataLayer = window.dataLayer || []
  const gtag = window.gtag ?? ((...args: unknown[]) => window.dataLayer?.push(args))
  gtag("consent", "update", {
    analytics_storage: "denied",
  })
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
