"use client"

import { isAnalyticsConsented } from "@/lib/cookie-consent"

export function getGtag(): ((...args: unknown[]) => void) | undefined {
  if (typeof window === "undefined") return undefined
  return (window as { gtag?: (...args: unknown[]) => void }).gtag
}

export function gtagIfConsented(...args: unknown[]) {
  if (!isAnalyticsConsented()) return
  const gtag = getGtag()
  if (gtag) gtag(...args)
}
