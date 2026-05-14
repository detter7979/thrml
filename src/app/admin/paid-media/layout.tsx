import Link from "next/link"

import { PaidMediaTabNav } from "./tab-nav"

export default function PaidMediaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0">
      <div className="border-b border-[#E7DACA] bg-[#FCF8F3] px-6 pt-3">
        <PaidMediaTabNav />
        <p className="pb-2 pt-1 text-xs text-[#6E5B49]">
          Briefs, generated assets, and launches:{" "}
          <Link href="/admin/agents?tab=creative" className="text-[#9A4A33] underline underline-offset-2">
            Creative pipeline
          </Link>
          .
        </p>
      </div>
      {children}
    </div>
  )
}
