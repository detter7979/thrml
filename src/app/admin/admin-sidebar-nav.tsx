"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  CalendarDays,
  Home,
  Inbox,
  Settings,
  UserRound,
  Users,
} from "lucide-react"

const NAV_ITEMS = [
  { href: "/admin", label: "Overview", icon: BarChart3 },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/admin/listings", label: "Listings", icon: Home },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/earnings", label: "Earnings", icon: BarChart3 },
  { href: "/admin/messages", label: "Messages", icon: Inbox },
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
        const Icon = item.icon
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
            <Icon className="size-4" />
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
