"use client"

import type { ReactNode } from "react"
import { useEffect, useRef } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { usePathname } from "next/navigation"

import { LISTING_ENTER, LISTING_EXIT } from "@/lib/motion-system"

const listingDetailPattern = /^\/listings\/[^/]+$/

function isListingDetailPath(pathname: string) {
  return listingDetailPattern.test(pathname)
}

export function MainContentMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ""
  const isListing = isListingDetailPath(pathname)
  const reduce = useReducedMotion()
  const nodeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = nodeRef.current
    if (!el) return
    el.style.willChange = "transform, opacity"
    const t = window.setTimeout(() => {
      el.style.willChange = "auto"
    }, 420)
    return () => window.clearTimeout(t)
  }, [pathname])

  const instant = { duration: 0 }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        ref={nodeRef}
        key={pathname}
        className="w-full min-w-0 overflow-x-hidden"
        initial={
          reduce || !isListing
            ? false
            : { x: 40, opacity: 0 }
        }
        animate={{ x: 0, opacity: 1 }}
        exit={
          reduce
            ? { opacity: 1, transition: instant }
            : isListing
              ? {
                  x: 40,
                  opacity: 0,
                  transition: { duration: LISTING_EXIT.duration, ease: [...LISTING_EXIT.ease] },
                }
              : { opacity: 1, x: 0, transition: instant }
        }
        transition={
          reduce || !isListing ? instant : { duration: LISTING_ENTER.duration, ease: [...LISTING_ENTER.ease] }
        }
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
