"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const TABS = [
  { href: "/admin/inbox", label: "Overview", match: (p: string) => p === "/admin/inbox" },
  { href: "/admin/inbox/messages", label: "Messages", match: (p: string) => p.startsWith("/admin/inbox/messages") },
  { href: "/admin/inbox/disputes", label: "Disputes", match: (p: string) => p.startsWith("/admin/inbox/disputes") },
  { href: "/admin/inbox/drafts", label: "Email drafts", match: (p: string) => p.startsWith("/admin/inbox/drafts") },
] as const

export function InboxTabNav() {
  const pathname = usePathname() || ""

  return (
    <nav className="flex flex-wrap gap-1 border-b border-[#E7DACA]" aria-label="Inbox sections">
      {TABS.map((tab) => {
        const active = tab.match(pathname)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative -mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "border-[#9A4A33] text-[#9A4A33]"
                : "border-transparent text-[#6E5B49] hover:border-[#DCCDBA] hover:text-[#2A2118]"
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
