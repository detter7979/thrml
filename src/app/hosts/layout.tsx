import type { ReactNode } from "react"

import { Navbar } from "@/components/shared/Navbar"

export default function HostsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-warm-50">
      <Navbar />
      <main>{children}</main>
    </div>
  )
}
