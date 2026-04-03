"use client"

import dynamic from "next/dynamic"
import type { ReactNode } from "react"

/** Framer Motion + Lenis load after first paint (not in the server bundle). */
export const SmoothScrollProviderDeferred = dynamic(
  () =>
    import("@/components/providers/SmoothScrollProvider").then((m) => m.SmoothScrollProvider),
  { ssr: false }
)

/** Page-transition motion; client-only so the animation chunk is not on the critical path. */
export const MainContentMotionDeferred = dynamic(
  () => import("@/components/shared/MainContentMotion").then((m) => m.MainContentMotion),
  { ssr: false }
)

export function DeferredMainWithMotion({ children }: { children: ReactNode }) {
  return <MainContentMotionDeferred>{children}</MainContentMotionDeferred>
}
