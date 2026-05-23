import { NextResponse } from "next/server"

import { fetchPlatformFeePercents } from "@/lib/fees"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

/**
 * Public read-only fee percents for checkout UI (amounts are still computed server-side on payment).
 */
export async function GET() {
  try {
    const admin = createAdminClient()
    const { guestFeePercent, hostFeePercent } = await fetchPlatformFeePercents(admin)
    return NextResponse.json(
      {
        guestFeePercent,
        hostFeePercent,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load fee settings"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
