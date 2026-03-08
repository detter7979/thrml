"use client"

import { useEffect, useState, type ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"

const QUOTES = [
  "Finally a sauna I can actually get into. — Marcus T., Seattle",
  "Booked a float tank 10 minutes from home. Unreal. — Priya K.",
  "Listed my barrel sauna in 5 minutes. Booked the next day. — Erik L.",
]

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setVisible(false)
      window.setTimeout(() => {
        setQuoteIndex((prev) => (prev + 1) % QUOTES.length)
        setVisible(true)
      }, 220)
    }, 4000)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <div className="min-h-[100svh] md:grid md:grid-cols-2">
      <aside className="relative hidden md:block">
        <Image src="/hero-sauna.png" alt="Wellness sauna interior" fill className="object-cover" />
        <div className="absolute inset-0 bg-[#1A1410]/55" />
        <div className="absolute top-8 left-8">
          <Link href="/" className="font-serif text-4xl lowercase text-white">
            thrml
          </Link>
        </div>
        <p
          className={`absolute right-8 bottom-10 left-8 max-w-md text-sm text-white/90 transition-opacity duration-300 ${
            visible ? "opacity-100" : "opacity-0"
          }`}
        >
          {QUOTES[quoteIndex]}
        </p>
      </aside>

      <main className="flex min-h-[100svh] items-center justify-center bg-white px-6 py-10">
        <div className="w-full max-w-[420px] space-y-6">
          <div className="space-y-2 text-center md:text-left">
            <Link href="/" className="font-serif text-3xl lowercase text-[#1A1410] md:hidden">
              thrml
            </Link>
            <h1 className="font-serif text-4xl text-[#1A1410]">{title}</h1>
            {subtitle ? <p className="text-sm text-[#746558]">{subtitle}</p> : null}
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
