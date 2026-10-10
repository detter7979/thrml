"use client"

import dynamic from "next/dynamic"
import type { ReactNode } from "react"

/**
 * Code-split, but still server-rendered. These wrap every page, so `ssr: false` here made the
 * server send an empty <body> (all content client-rendered: blank HTML for crawlers, CLS 0.85).
 * Lenis itself is still imported lazily inside an effect.
 */
export const SmoothScrollProviderDeferred = dynamic(
  () =>
    import("@/components/providers/SmoothScrollProvider").then((m) => m.SmoothScrollProvider),
)

/** Page-transition motion (AnimatePresence initial={false}, so first load renders with no animation). */
export const MainContentMotionDeferred = dynamic(
  () => import("@/components/shared/MainContentMotion").then((m) => m.MainContentMotion),
)

export function DeferredMainWithMotion({ children }: { children: ReactNode }) {
  return <MainContentMotionDeferred>{children}</MainContentMotionDeferred>
}
