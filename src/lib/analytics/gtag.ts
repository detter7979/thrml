"use client"

export function getGtag(): ((...args: unknown[]) => void) | undefined {
  if (typeof window === "undefined") return undefined
  return (window as { gtag?: (...args: unknown[]) => void }).gtag
}
