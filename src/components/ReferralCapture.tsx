"use client"

import { useSearchParams } from "next/navigation"
import { useEffect } from "react"

import { UTM_COOKIE, UTM_COOKIE_MAX_AGE_SEC, utmFromSearchParams } from "@/lib/attribution/utm-cookie"

const REF_COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60

export function ReferralCapture() {
  const params = useSearchParams()
  useEffect(() => {
    const ref = params?.get("ref")
    if (ref) {
      document.cookie = `thrml_ref=${encodeURIComponent(ref)}; path=/; max-age=${REF_COOKIE_MAX_AGE_SEC}; SameSite=Lax`
    }
    // Last ad click wins (closest to how Meta / Google attribute), kept 30 days.
    const utm = params ? utmFromSearchParams(new URLSearchParams(params.toString())) : null
    if (utm) {
      document.cookie = `${UTM_COOKIE}=${encodeURIComponent(JSON.stringify(utm))}; path=/; max-age=${UTM_COOKIE_MAX_AGE_SEC}; SameSite=Lax; Secure`
    }
  }, [params])
  return null
}
