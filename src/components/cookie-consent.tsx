"use client"

import { useEffect, useState } from "react"

import { COOKIE_CONSENT_ACCEPTED_EVENT } from "@/components/analytics/google-tag-loader"

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: Object[]
  }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem("thrml_cookie_consent")
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1200)
      return () => clearTimeout(timer)
    }

    if (consent === "accepted") {
      enableAnalytics()
    }
  }, [])

  function enableAnalytics() {
    if (typeof window === "undefined") return

    window.dataLayer = window.dataLayer || []
    const gtag = window.gtag ?? ((...args: unknown[]) => window.dataLayer?.push(args))
    gtag("consent", "update", {
      analytics_storage: "granted",
    })
  }

  function handleAccept() {
    localStorage.setItem("thrml_cookie_consent", "accepted")
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "thrml_cookie_consent",
        newValue: "accepted",
      })
    )
    window.dispatchEvent(new Event(COOKIE_CONSENT_ACCEPTED_EVENT))
    enableAnalytics()
    setVisible(false)
  }

  function handleDecline() {
    localStorage.setItem("thrml_cookie_consent", "declined")
    setVisible(false)
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
            <a href="/privacy#data-retention" className="text-neutral-600 underline hover:text-neutral-900">
              Privacy Policy
            </a>
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
