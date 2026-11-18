"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { CalendarDays, Compass, Heart, Home, MessageCircle, Sparkles, UserRound } from "lucide-react"

import {
  APP_MODE_EVENT,
  isAppTabActive,
  readAppMode,
  showAppTabBar,
  tabsForMode,
  type AppMode,
  type AppTabId,
} from "@/lib/app-nav"
import { cn } from "@/lib/utils"

const ICONS = {
  explore: Compass,
  today: Home,
  wishlists: Heart,
  bookings: CalendarDays,
  listings: Sparkles,
  inbox: MessageCircle,
  profile: UserRound,
} as const

export function AppTabBar({
  loggedIn,
  isHost,
  unreadMessages = 0,
}: {
  loggedIn: boolean
  isHost: boolean
  unreadMessages?: number
}) {
  const pathname = usePathname() || "/"
  const [mode, setMode] = useState<AppMode>(isHost ? "hosting" : "booking")

  useEffect(() => {
    const sync = () => setMode(readAppMode(isHost))
    sync()
    window.addEventListener(APP_MODE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(APP_MODE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [isHost])

  if (!loggedIn || !showAppTabBar(pathname)) return null

  const tabs = tabsForMode(mode)

  return (
    <nav
      data-app-tab-bar
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E7DED3] bg-[#FCFAF7]/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex h-16 max-w-lg">
        {tabs.map((tab) => {
          const Icon = ICONS[tab.id as AppTabId]
          const active = isAppTabActive(pathname, tab.id)
          return (
            <li key={tab.id} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-wide",
                  active ? "text-[#1A1410]" : "text-[#8E8176]"
                )}
              >
                <span className="relative">
                  <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                  {tab.id === "inbox" && unreadMessages > 0 ? (
                    <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full bg-[#C75B3A] px-1 text-center text-[9px] leading-4 text-white">
                      {unreadMessages > 9 ? "9+" : unreadMessages}
                    </span>
                  ) : null}
                </span>
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
