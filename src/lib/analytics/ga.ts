"use client"

import { sendGAEvent } from "@next/third-parties/google"

export function trackGaEvent(eventName: string, params: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV !== "production") return
  sendGAEvent("event", eventName, params)
}
