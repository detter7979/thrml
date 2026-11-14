"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  CalendarDays,
  Gift,
  Home,
  Inbox,
  LineChart,
  Megaphone,
  PieChart,
  Rocket,
  Settings,
  Shield,
  Sparkles,
  UserRound,
  Users,
  Wallet,
} from "lucide-react"

type NavItem = { href: string; label: string; icon: LucideIcon }

type NavSection = { label: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  {
    label: "Business",
    items: [
      { href: "/admin", label: "Overview", icon: BarChart3 },
      { href: "/admin/analytics", label: "Analytics", icon: LineChart },
      { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
      { href: "/admin/listings", label: "Listings", icon: Home },
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/referrals", label: "Referrals", icon: Gift },
      { href: "/admin/credits", label: "Credits", icon: Wallet },
      { href: "/admin/earnings", label: "Earnings", icon: BarChart3 },
      { href: "/admin/finance", label: "Finance", icon: PieChart },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/admin/launch-readiness", label: "Launch readiness", icon: Rocket },
      { href: "/admin/paid-media", label: "Paid media", icon: Megaphone },
    ],
  },
  {
    label: "Creative & automation",
    items: [{ href: "/admin/agents", label: "Creative pipeline", icon: Sparkles }],
  },
  {
    label: "Support & inbox",
    items: [{ href: "/admin/inbox", label: "Inbox hub", icon: Inbox }],
  },
  {
    label: "System",
    items: [
      { href: "/admin/privacy-requests", label: "Privacy requests", icon: Shield },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
]

function itemIsActive(item: NavItem, pathname: string | null) {
  const p = pathname ?? ""
  if (item.href === "/admin/inbox") {
    return p === "/admin/inbox" || p.startsWith("/admin/inbox/")
  }
  if (item.href === "/admin") {
    return p === "/admin"
  }
  return p === item.href || p.startsWith(`${item.href}/`)
}

/** Label of the admin section the current path belongs to (for the mobile header). */
export function activeAdminSectionLabel(pathname: string | null): string {
  for (const section of SECTIONS) {
    const item = section.items.find((i) => itemIsActive(i, pathname))
    if (item) return item.label
  }
  return "Admin"
}

export function AdminSidebarNav({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname()

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto p-3">
      {SECTIONS.map((section) => (
        <div key={section.label}>
          <p className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-[0.12em] text-[#9A4A33]">
            {section.label}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active = itemIsActive(item, pathname)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition md:py-2 ${
                    active
                      ? "bg-[#E8DCCB] text-[#2A2118]"
                      : "text-[#5B4A3A] hover:bg-[#DED0BE] hover:text-[#1F170F]"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
      <div className="border-t border-[#DCCDBA] pt-3">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#5B4A3A] hover:bg-[#DED0BE] hover:text-[#1F170F]"
        >
          <UserRound className="size-4" />
          Back to dashboard
        </Link>
      </div>
    </nav>
  )
}
