"use client"

import { useCookieConsent } from "@/contexts/cookie-consent-context"

type DoNotSellLinkProps = {
  className?: string
  /** Shorter visible label; full CPRA text remains in aria-label. */
  compact?: boolean
}

export function DoNotSellLink({ className, compact = false }: DoNotSellLinkProps) {
  const { openDoNotSellPreferences } = useCookieConsent()
  const fullLabel = "Do Not Sell or Share My Personal Information"

  return (
    <button
      type="button"
      onClick={openDoNotSellPreferences}
      className={className}
      aria-label={compact ? fullLabel : undefined}
    >
      {compact ? "Do Not Sell or Share" : fullLabel}
    </button>
  )
}
