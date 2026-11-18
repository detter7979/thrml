"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { APP_MODE_EVENT, readAppMode, writeAppMode, type AppMode } from "@/lib/app-nav"
import { cn } from "@/lib/utils"

export function AppModeSwitch({ canHost }: { canHost: boolean }) {
  const router = useRouter()
  const [mode, setMode] = useState<AppMode>("booking")

  useEffect(() => {
    const sync = () => setMode(readAppMode(canHost))
    sync()
    window.addEventListener(APP_MODE_EVENT, sync)
    return () => window.removeEventListener(APP_MODE_EVENT, sync)
  }, [canHost])

  if (!canHost) return null

  function choose(next: AppMode) {
    writeAppMode(next)
    setMode(next)
    router.push(next === "hosting" ? "/dashboard" : "/explore")
  }

  return (
    <div className="rounded-3xl bg-white p-3">
      <p className="px-1 text-xs font-medium tracking-[0.14em] text-[#8B4513] uppercase">Mode</p>
      <div className="mt-2 grid grid-cols-2 rounded-full bg-[#F3EBE3] p-1">
        {(
          [
            ["booking", "Booking"],
            ["hosting", "Hosting"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => choose(id)}
            className={cn(
              "h-10 rounded-full text-sm font-medium",
              mode === id ? "bg-[#1A1410] text-[#F5EFE8]" : "text-[#6D5E51]"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 px-1 text-xs text-[#7A6A5D]">
        {mode === "hosting"
          ? "Today, your listings, and the guests booked in."
          : "Find a space, save it, and manage the sessions you booked."}
      </p>
    </div>
  )
}
