"use client"

import { createContext, useContext, type ReactNode } from "react"

import type { PlatformFeePercents } from "@/lib/fees"

const PlatformFeesContext = createContext<PlatformFeePercents | null>(null)

export function PlatformFeesProvider({
  children,
  initialPercents,
}: {
  children: ReactNode
  initialPercents: PlatformFeePercents
}) {
  return (
    <PlatformFeesContext.Provider value={initialPercents}>{children}</PlatformFeesContext.Provider>
  )
}

export function usePlatformFeePercents(): PlatformFeePercents {
  const ctx = useContext(PlatformFeesContext)
  if (!ctx) {
    throw new Error("usePlatformFeePercents must be used within PlatformFeesProvider")
  }
  return ctx
}
