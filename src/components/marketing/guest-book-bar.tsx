"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

export function GuestBookBar({ href, price }: { href: string; price: string | null }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const footer = document.querySelector("footer")
      const footerTop = footer?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
      const pastHero = window.scrollY > window.innerHeight * 0.55
      setVisible(pastHero && footerTop > window.innerHeight)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#1A1410]/10 bg-[#f7f3ee]/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <p className="text-sm text-[#1A1410]">{price ?? "Private session"}</p>
        <Link
          href={href}
          className="inline-flex h-11 items-center rounded-full bg-[#C75B3A] px-5 text-sm font-medium text-white"
        >
          View times
        </Link>
      </div>
    </div>
  )
}
