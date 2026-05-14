import Link from "next/link"
import type { ReactNode } from "react"

import { InboxTabNav } from "./inbox-tab-nav"

export default function AdminInboxLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 text-[#2A2118]">
      <div className="border-b border-[#E7DACA] bg-[#FCF8F3] px-4 pt-4 md:px-6">
        <div className="mx-auto max-w-[1400px] space-y-1">
          <h1 className="font-serif text-2xl lowercase tracking-tight md:text-3xl">inbox & support</h1>
          <p className="max-w-3xl text-sm text-[#5B4A3A]">
            Messages, disputes, and inbox-agent email drafts in one shell. Paid media and creative work live in{" "}
            <Link href="/admin/paid-media" className="text-[#9A4A33] underline underline-offset-2">
              Paid media
            </Link>{" "}
            and{" "}
            <Link href="/admin/agents?tab=creative" className="text-[#9A4A33] underline underline-offset-2">
              Creative pipeline
            </Link>
            .
          </p>
        </div>
        <div className="mx-auto mt-3 max-w-[1400px]">
          <InboxTabNav />
        </div>
      </div>
      <div className="mx-auto max-w-[1400px]">{children}</div>
    </div>
  )
}
