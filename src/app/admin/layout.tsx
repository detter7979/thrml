import Link from "next/link"
import type { ReactNode } from "react"

import { requireAdmin } from "@/lib/admin-guard"
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
      <main className="overflow-auto">
        <div className="mx-auto w-full max-w-[1400px]">{children}</div>
      </main>
      <aside className="sticky bottom-0 border-t border-[#DCCDBA] bg-[#F3EADD] p-3 md:hidden">
        <Link
          href="/admin"
          className="block rounded-lg border border-[#DCCDBA] px-3 py-2 text-center text-sm text-[#2A2118]"
        >
          Admin home
        </Link>
      </aside>
    </div>
  )
}
