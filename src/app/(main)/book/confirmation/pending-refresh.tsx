"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

type PendingRefreshProps = {
  enabled: boolean
}

export function PendingRefresh({ enabled }: PendingRefreshProps) {
  const router = useRouter()

  useEffect(() => {
    if (!enabled) return

    // Poll briefly after checkout so webhook-driven confirmation appears automatically.
    let attempts = 0
    const maxAttempts = 12
    const timer = window.setInterval(() => {
      attempts += 1
      router.refresh()
      if (attempts >= maxAttempts) {
        window.clearInterval(timer)
      }
    }, 2500)

    return () => window.clearInterval(timer)
  }, [enabled, router])

  return null
}
