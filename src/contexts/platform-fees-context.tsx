"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

import type { PlatformFeePercents } from "@/lib/fees"

const PlatformFeesContext = createContext<PlatformFeePercents | null>(null)

export function PlatformFeesProvider({
  children,
  initialPercents,
}: {
  children: ReactNode
  initialPercents: PlatformFeePercents
}) {
  const [percents, setPercents] = useState(initialPercents)

  useEffect(() => {
    let cancelled = false

    fetch("/api/platform/fees", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { guestFeePercent?: number; hostFeePercent?: number; error?: string }) => {
        if (cancelled || payload.error) return
        if (
          typeof payload.guestFeePercent !== "number" ||
          typeof payload.hostFeePercent !== "number"
        ) {
          return
        }
        setPercents({
          guestFeePercent: payload.guestFeePercent,
          hostFeePercent: payload.hostFeePercent,
        })
      })
      .catch(() => {
        // Keep SSR values when the refresh fails.
      })

    return () => {
      cancelled = true
    }
  }, [])

  return <PlatformFeesContext.Provider value={percents}>{children}</PlatformFeesContext.Provider>
}

export function usePlatformFeePercents(): PlatformFeePercents {
  const ctx = useContext(PlatformFeesContext)
  if (!ctx) {
    throw new Error("usePlatformFeePercents must be used within PlatformFeesProvider")
  }
  return ctx
}
