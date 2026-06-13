"use client"

import { useCookieConsent } from "@/contexts/cookie-consent-context"

type DoNotSellLinkProps = {
  className?: string
}

export function DoNotSellLink({ className }: DoNotSellLinkProps) {
  const { openDoNotSellPreferences } = useCookieConsent()

  return (
    <button type="button" onClick={openDoNotSellPreferences} className={className}>
      Do Not Sell or Share My Personal Information
    </button>
  )
}
