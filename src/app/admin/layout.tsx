import type { ReactNode } from "react"

import { SiteFooter } from "@/components/shared/SiteFooter"
import { requireAdmin } from "@/lib/admin-guard"
import { AdminMobileNav } from "./admin-mobile-nav"
import { AdminSidebarNav } from "./admin-sidebar-nav"

export const dynamic = "force-dynamic"

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin()

  return (
    <div className="min-h-screen bg-[#EDE3D4] text-[#2A2118] md:grid md:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-[#DCCDBA] bg-[#F3EADD] md:flex md:flex-col">
        <div className="border-b border-[#DCCDBA] px-5 py-4">
          <p className="font-serif text-xl lowercase text-[#2A2118]">thrml</p>
          <p className="text-[10px] tracking-[0.15em] text-[#9A4A33]">ADMIN</p>
        </div>
        <AdminSidebarNav />
      </aside>
      <AdminMobileNav />
      <main className="min-w-0 overflow-auto">
        <div className="mx-auto w-full max-w-[1400px]">
          {/* At least one screen tall, so the footer always starts just below the fold. */}
          <div className="min-h-[100svh]">{children}</div>
          <SiteFooter />
        </div>
      </main>
    </div>
  )
}
