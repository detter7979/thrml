"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarDays, Compass, Heart, LayoutGrid, Sparkles, UserRound } from "lucide-react"

import { activityTab, isAppTabActive, showAppTabBar, type AppTabId } from "@/lib/app-nav"
import { cn } from "@/lib/utils"

export function AppTabBar({ loggedIn, isHost }: { loggedIn: boolean; isHost: boolean }) {
  const pathname = usePathname() || "/"
  if (!showAppTabBar(pathname)) return null

  const activity = activityTab(isHost)
  const gate = (href: string) => (loggedIn ? href : `/login?next=${encodeURIComponent(href)}`)

  const tabs: Array<{ id: AppTabId; href: string; label: string; icon: typeof Compass }> = [
    { id: "explore", href: "/explore", label: "Explore", icon: Compass },
    { id: "dashboard", href: gate("/dashboard"), label: "Dashboard", icon: LayoutGrid },
    {
      id: "activity",
      href: gate(activity.href),
      label: activity.label,
      icon: isHost ? Sparkles : CalendarDays,
    },
    { id: "wishlists", href: gate("/dashboard/saved"), label: "Wishlists", icon: Heart },
    {
      id: "profile",
      href: loggedIn ? "/dashboard/account" : "/signup",
      label: "Profile",
      icon: UserRound,
    },
  ]

  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E7DED3] bg-[#FCFAF7]/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex h-16 max-w-lg">
        {tabs.map((tab) => {
          const Icon = tab.icon
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
                <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
