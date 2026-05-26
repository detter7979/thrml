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
  enableAnalyticsStorage,
  getCookieConsent,
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
    const consent = getCookieConsent()
    if (!consent) {
      const timer = setTimeout(() => setBannerVisible(true), 1200)
      return () => clearTimeout(timer)
    }

    if (consent === COOKIE_CONSENT_ACCEPTED) {
      enableAnalyticsStorage()
    }
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
