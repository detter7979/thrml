"use client"

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react"
import { MotionConfig, useReducedMotion } from "framer-motion"
import Lenis from "lenis"
import "lenis/dist/lenis.css"

const LenisContext = createContext<React.MutableRefObject<Lenis | null> | null>(null)

/** Latest Lenis instance (or null); ref is stable so callers read `.current` inside effects / callbacks. */
export function useLenisRef(): React.MutableRefObject<Lenis | null> | null {
  return useContext(LenisContext)
}

/**
 * Smooth, inertial scrolling. Lenis updates native scroll, so Framer Motion `useScroll` stays aligned.
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

    const instance = new Lenis({
      lerp: 0.08,
      smoothWheel: true,
      touchMultiplier: 1.5,
    })
    lenisRef.current = instance

    let raf = 0
    function frame(time: number) {
      instance.raf(time)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      instance.destroy()
      lenisRef.current = null
    }
  }, [prefersReducedMotion])

  return (
    <MotionConfig reducedMotion="user">
      <LenisContext.Provider value={lenisRef}>{children}</LenisContext.Provider>
    </MotionConfig>
  )
}
