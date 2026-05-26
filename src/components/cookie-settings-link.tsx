"use client"

import { useCookieConsent } from "@/contexts/cookie-consent-context"

type CookieSettingsLinkProps = {
  className?: string
}

export function CookieSettingsLink({ className }: CookieSettingsLinkProps) {
  const { openCookiePreferences } = useCookieConsent()

  return (
    <button type="button" onClick={openCookiePreferences} className={className}>
      Cookie Settings
    </button>
  )
}
