"use client"

import { sendGAEvent } from "@next/third-parties/google"

import { isAnalyticsConsented } from "@/lib/cookie-consent"

export function trackGaEvent(eventName: string, params: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV !== "production") return
  if (!isAnalyticsConsented()) return
  sendGAEvent("event", eventName, params)
}
