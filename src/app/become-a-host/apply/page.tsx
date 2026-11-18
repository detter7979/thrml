import type { Metadata } from "next"

import { getPlatformFeePercentsCached } from "@/lib/fees-server"
import { fetchFoundingHostSettings, foundingSpotsRemaining } from "@/lib/host/founding-host"
import { guestBookingsOpen } from "@/lib/host/host-funnel"
import { createAdminClient } from "@/lib/supabase/admin"

import { HostApplicationClient } from "./host-application-client"

export const revalidate = 300

export const metadata: Metadata = {
  title: "Apply to host on thrml",
  description: "We're starting thrml in Seattle with a small group of founding hosts. Apply in two minutes.",
  robots: { index: false, follow: true },
}

export default async function HostApplicationPage() {
  let founding: { cap: number; spotsLeft: number; feePercent: number; windowDays: number } | null = null
  let standardFeePercent: number | null = null
  try {
    const admin = createAdminClient()
    const [settings, fees] = await Promise.all([fetchFoundingHostSettings(admin), getPlatformFeePercentsCached()])
    standardFeePercent = fees.hostFeePercent
    if (!guestBookingsOpen()) {
      const spotsLeft = await foundingSpotsRemaining(admin, settings.cap)
      founding = { cap: settings.cap, spotsLeft, feePercent: settings.feePercent, windowDays: settings.windowDays }
    }
  } catch {
    founding = null
  }

  return <HostApplicationClient founding={founding} standardFeePercent={standardFeePercent} />
}
