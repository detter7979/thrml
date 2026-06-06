"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { CookieConsentBanner } from "@/components/cookie-consent"
import {
  COOKIE_CONSENT_ACCEPTED,
  COOKIE_CONSENT_DECLINED,
  COOKIE_CONSENT_KEY,
  grantAnalyticsConsent,
  getCookieConsent,
  revokeAnalyticsConsent,
} from "@/lib/cookie-consent"

type CookieConsentContextValue = {
  openCookiePreferences: () => void
}

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null)

export function useCookieConsent() {
  const context = useContext(CookieConsentContext)
  if (!context) {
    throw new Error("useCookieConsent must be used within CookieConsentProvider")
  }
  return context
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [bannerVisible, setBannerVisible] = useState(false)

  const openCookiePreferences = useCallback(() => {
    setBannerVisible(true)
  }, [])

  const closeBanner = useCallback(() => {
    setBannerVisible(false)
  }, [])

  useEffect(() => {
    function syncFromStorage() {
      const consent = getCookieConsent()
      if (!consent) {
        setBannerVisible(true)
        return
      }

      setBannerVisible(false)
      if (consent === COOKIE_CONSENT_ACCEPTED) {
        grantAnalyticsConsent()
      } else if (consent === COOKIE_CONSENT_DECLINED) {
        revokeAnalyticsConsent()
      }
    }

    syncFromStorage()

    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key === COOKIE_CONSENT_KEY) {
        syncFromStorage()
      }
    }

    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const value = useMemo(
    () => ({
      openCookiePreferences,
    }),
    [openCookiePreferences]
  )

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
      <CookieConsentBanner visible={bannerVisible} onClose={closeBanner} />
    </CookieConsentContext.Provider>
  )
}
