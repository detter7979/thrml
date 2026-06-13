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
  getCookieConsent,
  restoreAnalyticsConsentFromStorage,
} from "@/lib/cookie-consent"

type CookieConsentContextValue = {
  openCookiePreferences: () => void
  openDoNotSellPreferences: () => void
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
  const [showAdvertisingToggle, setShowAdvertisingToggle] = useState(false)

  const openCookiePreferences = useCallback(() => {
    setShowAdvertisingToggle(false)
    setBannerVisible(true)
  }, [])

  const openDoNotSellPreferences = useCallback(() => {
    setShowAdvertisingToggle(true)
    setBannerVisible(true)
  }, [])

  const closeBanner = useCallback(() => {
    setBannerVisible(false)
    setShowAdvertisingToggle(false)
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
        restoreAnalyticsConsentFromStorage(true)
      } else if (consent === COOKIE_CONSENT_DECLINED) {
        restoreAnalyticsConsentFromStorage(false)
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
      openDoNotSellPreferences,
    }),
    [openCookiePreferences, openDoNotSellPreferences]
  )

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
      <CookieConsentBanner
        visible={bannerVisible}
        onClose={closeBanner}
        showAdvertisingToggle={showAdvertisingToggle}
      />
    </CookieConsentContext.Provider>
  )
}
