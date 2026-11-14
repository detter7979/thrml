import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { SiteFooter } from "@/components/shared/SiteFooter"
import { Navbar } from "@/components/shared/Navbar"
import { createClient } from "@/lib/supabase/server"

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login?next=/settings/delete-account")

  return (
    <div className="min-h-screen bg-warm-50">
      <Navbar />
      {/* At least a full screen tall, so the footer always starts below the fold (matches admin + dashboard). */}
      <main id="main-content" className="min-h-[100svh] min-w-0 overflow-x-hidden">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
