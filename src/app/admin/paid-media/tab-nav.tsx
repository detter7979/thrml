"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const TABS = [
  { href: "/admin/paid-media", label: "Queue", match: (p: string) => p === "/admin/paid-media" },
  { href: "/admin/paid-media/campaigns", label: "Campaigns", match: (p: string) => p.startsWith("/admin/paid-media/campaigns") },
  { href: "/admin/paid-media/executions", label: "Executions", match: (p: string) => p.startsWith("/admin/paid-media/executions") },
  { href: "/admin/paid-media/runs", label: "Reporting", match: (p: string) => p.startsWith("/admin/paid-media/runs") },
  { href: "/admin/paid-media/evaluator", label: "Evaluator", match: (p: string) => p.startsWith("/admin/paid-media/evaluator") },
  { href: "/admin/paid-media/rules", label: "Rules", match: (p: string) => p.startsWith("/admin/paid-media/rules") },
]

export function PaidMediaTabNav() {
  const pathname = usePathname() || ""

  return (
    <nav className="flex flex-wrap gap-1 border-b border-[#E7DACA]" aria-label="Paid media sections">
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
