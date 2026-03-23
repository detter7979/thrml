import { NextResponse } from "next/server"

import { getPlatformFeePercentsCached } from "@/lib/fees"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Public read-only fee percents for checkout UI (amounts are still computed server-side on payment).
 */
export async function GET() {
  try {
    const admin = createAdminClient()
    const { guestFeePercent, hostFeePercent } = await getPlatformFeePercentsCached(admin)
    return NextResponse.json({
      guestFeePercent,
      hostFeePercent,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load fee settings"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
