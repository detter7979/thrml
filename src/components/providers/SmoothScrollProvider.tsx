"use client"

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react"
import { MotionConfig, useReducedMotion } from "framer-motion"

import type Lenis from "lenis"

const LenisContext = createContext<React.MutableRefObject<Lenis | null> | null>(null)

/** Latest Lenis instance (or null); ref is stable so callers read `.current` inside effects / callbacks. */
export function useLenisRef(): React.MutableRefObject<Lenis | null> | null {
  return useContext(LenisContext)
}

/**
 * Smooth, inertial scrolling. Lenis updates native scroll, so Framer Motion `useScroll` stays aligned.
 * Lenis is loaded via dynamic `import()` so it is not on the critical JS path.
 */
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion()
  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    if (prefersReducedMotion) {
      lenisRef.current?.destroy()
      lenisRef.current = null
      return
    }

    let cancelled = false
    let rafId = 0

    void Promise.all([import("lenis"), import("lenis/dist/lenis.css")]).then(([lenisMod]) => {
      if (cancelled || typeof window === "undefined") return
      const LenisCtor = lenisMod.default
      const instance = new LenisCtor({
        lerp: 0.08,
        smoothWheel: true,
        touchMultiplier: 1.5,
      })
      lenisRef.current = instance

      function frame(time: number) {
        instance.raf(time)
        rafId = requestAnimationFrame(frame)
      }
      rafId = requestAnimationFrame(frame)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      lenisRef.current?.destroy()
      lenisRef.current = null
    }
  }, [prefersReducedMotion])

  return (
    <MotionConfig reducedMotion="user">
      <LenisContext.Provider value={lenisRef}>{children}</LenisContext.Provider>
    </MotionConfig>
  )
}
