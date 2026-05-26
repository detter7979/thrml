"use client"

import Link from "next/link"

import {
  COOKIE_CONSENT_ACCEPTED,
  COOKIE_CONSENT_DECLINED,
  COOKIE_CONSENT_KEY,
  disableAnalyticsStorage,
  enableAnalyticsStorage,
  notifyConsentChanged,
} from "@/lib/cookie-consent"

type CookieConsentBannerProps = {
  visible: boolean
  onClose: () => void
}

export function CookieConsentBanner({ visible, onClose }: CookieConsentBannerProps) {
  function handleAccept() {
    localStorage.setItem(COOKIE_CONSENT_KEY, COOKIE_CONSENT_ACCEPTED)
    notifyConsentChanged(COOKIE_CONSENT_ACCEPTED)
    enableAnalyticsStorage()
    onClose()
  }

  function handleDecline() {
    localStorage.setItem(COOKIE_CONSENT_KEY, COOKIE_CONSENT_DECLINED)
    notifyConsentChanged(COOKIE_CONSENT_DECLINED)
    disableAnalyticsStorage()
    onClose()
  }

  if (!visible) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="mb-1 text-sm font-medium text-neutral-900">We use cookies</p>
          <p className="text-xs leading-relaxed text-neutral-500">
            We use analytics cookies (retained up to 14 months) to understand how people use thrml and improve the
            experience. We never sell your data.{" "}
            <Link href="/privacy#data-retention" className="text-neutral-600 underline hover:text-neutral-900">
              Privacy Policy
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
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
        </div>
      </div>
    </div>
  )
}
