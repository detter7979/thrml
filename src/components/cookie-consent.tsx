"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import {
  COOKIE_CONSENT_ACCEPTED,
  COOKIE_CONSENT_DECLINED,
  COOKIE_CONSENT_KEY,
  grantAnalyticsConsent,
  notifyConsentChanged,
  revokeAnalyticsConsent,
} from "@/lib/cookie-consent"

type CookieConsentBannerProps = {
  visible: boolean
  onClose: () => void
  showAdvertisingToggle?: boolean
}

export function CookieConsentBanner({
  visible,
  onClose,
  showAdvertisingToggle = false,
}: CookieConsentBannerProps) {
  const [mounted, setMounted] = useState(false)
  const [advertisingEnabled, setAdvertisingEnabled] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  function handleAccept() {
    localStorage.setItem(COOKIE_CONSENT_KEY, COOKIE_CONSENT_ACCEPTED)
    notifyConsentChanged(COOKIE_CONSENT_ACCEPTED)
    grantAnalyticsConsent()
    onClose()
  }

  function handleDecline() {
    localStorage.setItem(COOKIE_CONSENT_KEY, COOKIE_CONSENT_DECLINED)
    notifyConsentChanged(COOKIE_CONSENT_DECLINED)
    revokeAnalyticsConsent()
    onClose()
  }

  function handleSavePreferences() {
    if (advertisingEnabled) {
      handleAccept()
    } else {
      handleDecline()
    }
  }

  if (!visible || !mounted) return null

  return createPortal(
    <div
      className="fixed bottom-0 left-0 right-0 z-[200] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6"
      role="dialog"
      aria-label="Cookie consent"
      aria-modal="false"
    >
      <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl">
        <div className="w-full flex-1">
          <p className="mb-1 text-sm font-medium text-neutral-900">
            {showAdvertisingToggle ? "Your privacy choices" : "We use cookies"}
          </p>
          <p className="text-xs leading-relaxed text-neutral-500">
            We use analytics and advertising cookies (retained up to 14 months) to understand how people use thrml and
            measure ad performance. We never sell your data for money. Under some state laws, ad measurement may
            constitute &quot;sharing.&quot;{" "}
            <Link href="/privacy" className="text-neutral-600 underline hover:text-neutral-900">
              Privacy Policy
            </Link>
          </p>

          {showAdvertisingToggle ? (
            <div className="mt-4 rounded-xl border border-neutral-100 bg-neutral-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-neutral-900">Advertising &amp; sharing</p>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                    Controls the Meta Pixel and related ad measurement. When off, we do not load Facebook tracking or
                    send conversion events.
                  </p>
                </div>
                <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={advertisingEnabled}
                    onChange={(e) => setAdvertisingEnabled(e.target.checked)}
                  />
                  <span className="h-6 w-11 rounded-full bg-neutral-300 transition peer-checked:bg-[#C4623A]" />
                  <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white transition peer-checked:translate-x-5" />
                </label>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex w-full shrink-0 flex-wrap gap-2">
          {showAdvertisingToggle ? (
            <button
              onClick={handleSavePreferences}
              className="rounded-full bg-[#C4623A] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#b05530]"
            >
              Save preferences
            </button>
          ) : (
            <>
              <button
                onClick={handleDecline}
                className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
              >
                Decline
              </button>
              <button
                onClick={handleAccept}
                className="rounded-full bg-[#C4623A] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#b05530]"
              >
                Accept
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
