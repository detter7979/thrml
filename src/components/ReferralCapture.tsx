"use client"

import { useSearchParams } from "next/navigation"
import { useEffect } from "react"

const REF_COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60

export function ReferralCapture() {
  const params = useSearchParams()
  useEffect(() => {
    const ref = params?.get("ref")
    if (ref) {
      document.cookie = `thrml_ref=${encodeURIComponent(ref)}; path=/; max-age=${REF_COOKIE_MAX_AGE_SEC}; SameSite=Lax`
    }
  }, [params])
  return null
}
