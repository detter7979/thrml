"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { SignupIntro } from "@/components/auth/signup-intro"
import {
  isNativeShell,
  markOnboardingComplete,
  modeForIntent,
  onboardingComplete,
  postSignupPath,
  writeAppMode,
  type AppIntent,
} from "@/lib/app-nav"
import { createClient } from "@/lib/supabase/client"

export function NativeOnboarding() {
  const pathname = usePathname() || "/"
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [intent, setIntent] = useState<AppIntent>("guest")

  useEffect(() => {
    if (!isNativeShell()) {
      setOpen(false)
      return
    }
    const accountFlow =
      pathname.startsWith("/login") || pathname.startsWith("/signup") || pathname.startsWith("/auth")
    if (accountFlow || onboardingComplete()) {
      setOpen(false)
      return
    }
    setOpen(true)
  }, [pathname])

  if (!open) return null

  async function finish(next: string, mode = modeForIntent(intent)) {
    markOnboardingComplete()
    writeAppMode(mode)
    setOpen(false)
    router.push(next)
  }

  return (
    <div className="fixed inset-0 z-[220] overflow-y-auto bg-[#1A1410]">
      <SignupIntro
        intent={intent}
        onIntent={setIntent}
        onContinue={async () => {
          const supabase = createClient()
          const {
            data: { user },
          } = await supabase.auth.getUser()
          const next = user ? postSignupPath(intent, null) : `/signup?intent=${intent}`
          await finish(next)
        }}
        onLookAround={() => finish("/explore", "booking")}
        onLogin={() => {
          markOnboardingComplete()
          setOpen(false)
          router.push("/login")
        }}
      />
    </div>
  )
}
