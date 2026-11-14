"use client"

import { Menu } from "lucide-react"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

import { AdminSidebarNav, activeAdminSectionLabel } from "./admin-sidebar-nav"

/**
 * Phone/tablet admin navigation. The desktop sidebar is hidden below `md`, which left only an
 * "Admin home" link on iPhone and no way to reach other admin sections.
 */
export function AdminMobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-[#DCCDBA] bg-[#F3EADD]/95 px-4 py-3 backdrop-blur md:hidden">
      <div className="min-w-0">
        <p className="font-serif text-lg lowercase leading-none text-[#2A2118]">
          thrml <span className="align-middle text-[10px] font-sans tracking-[0.15em] text-[#9A4A33]">ADMIN</span>
        </p>
        <p className="mt-1 truncate text-xs text-[#5B4A3A]">{activeAdminSectionLabel(pathname)}</p>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          className="inline-flex size-11 items-center justify-center rounded-lg border border-[#DCCDBA] bg-[#FCFAF7] text-[#2A2118]"
          aria-label="Open admin menu"
        >
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-[84vw] max-w-xs gap-0 bg-[#F3EADD] p-0">
          <div className="border-b border-[#DCCDBA] px-5 py-4">
            <SheetTitle className="font-serif text-xl lowercase text-[#2A2118]">thrml</SheetTitle>
            <p className="text-[10px] tracking-[0.15em] text-[#9A4A33]">ADMIN</p>
          </div>
          <AdminSidebarNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </header>
  )
}
