import type { ReactNode } from "react"

import { Navbar } from "@/components/shared/Navbar"

export default function HostsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-warm-50 pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
      <Navbar />
      <main>{children}</main>
    </div>
  )
}
