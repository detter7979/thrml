"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  CalendarDays,
  Home,
  Inbox,
  LineChart,
  Settings,
  UserRound,
  Users,
} from "lucide-react"

type NavItem =
  | { href: string; label: string; icon: LucideIcon }
  | { href: string; label: string; emoji: string }

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Overview", icon: BarChart3 },
  { href: "/admin/analytics", label: "Analytics", icon: LineChart },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/admin/listings", label: "Listings", icon: Home },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/earnings", label: "Earnings", icon: BarChart3 },
  { href: "/admin/messages", label: "Messages", icon: Inbox },
  { href: "/admin/disputes", label: "Disputes", emoji: "⚖️" },
  { href: "/admin/agent", label: "Agent", emoji: "🤖" },
  { href: "/admin/settings", label: "Settings", icon: Settings },
]

export function AdminSidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 space-y-1 p-3">
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/admin" && pathname.startsWith(item.href))
        const icon =
          "emoji" in item ? (
            <span className="flex size-4 items-center justify-center text-sm" aria-hidden>
              {item.emoji}
            </span>
          ) : (() => {
              const Icon = item.icon
              return <Icon className="size-4" />
            })()
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
              active
                ? "bg-[#E8DCCB] text-[#2A2118]"
                : "text-[#5B4A3A] hover:bg-[#DED0BE] hover:text-[#1F170F]"
            }`}
          >
            {icon}
            {item.label}
          </Link>
        )
      })}
      <div className="mt-4 border-t border-[#DCCDBA] pt-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#5B4A3A] hover:bg-[#DED0BE] hover:text-[#1F170F]"
        >
          <UserRound className="size-4" />
          Back to dashboard
        </Link>
      </div>
    </nav>
  )
}
