"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { SignupIntro } from "@/components/auth/signup-intro"
import {
  isNativeShell,
  markOnboardingComplete,
  onboardingComplete,
  onboardingDestination,
  onboardingMode,
  writeAppMode,
  type AppIntent,
  type OnboardingExit,
} from "@/lib/app-nav"

export function NativeOnboarding() {
  const pathname = usePathname() || "/"
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [intent, setIntent] = useState<AppIntent | null>(null)

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

  // No account is needed to browse or to apply to host: sign-in happens at booking, saving,
  // or listing submission, so every exit goes straight to its destination.
  function finish(exit: OnboardingExit) {
    markOnboardingComplete()
    writeAppMode(onboardingMode(exit))
    setOpen(false)
    router.push(onboardingDestination(exit))
  }

  return (
    <div className="fixed inset-0 z-[220] overflow-y-auto bg-[#F7F3EE]">
      <SignupIntro
        intent={intent}
        onIntent={setIntent}
        onContinue={() => {
          if (intent) finish(intent)
        }}
        onLookAround={() => finish("look_around")}
        onLogin={() => {
          markOnboardingComplete()
          setOpen(false)
          router.push("/login")
        }}
      />
    </div>
  )
}
