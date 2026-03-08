import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { sendAccessCode } from "@/lib/access/send-access-code"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const payloadSchema = z.object({
  code: z.string().trim().min(1).max(20),
  send: z.boolean().optional(),
})

type Params = { id: string }

function isMissingColumnError(message: string) {
  const normalized = message.toLowerCase()
  return (
    (normalized.includes("column") && normalized.includes("does not exist")) ||
    (normalized.includes("could not find") &&
      normalized.includes("column") &&
      normalized.includes("schema cache"))
  )
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const admin = createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const parsed = payloadSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Code is required (max 20 characters)." }, { status: 400 })
    }

    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id, host_id, listing_id")
      .eq("id", id)
      .maybeSingle()
    if (bookingError || !booking) {
      return NextResponse.json({ error: bookingError?.message ?? "Booking not found" }, { status: 404 })
    }

    const { data: listing, error: listingError } = await admin
      .from("listings")
      .select("id, host_id")
      .eq("id", booking.listing_id)
      .maybeSingle()
    if (listingError || !listing) {
      return NextResponse.json({ error: listingError?.message ?? "Listing not found" }, { status: 404 })
    }
    if (listing.host_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const updateCandidates = [
      {
        access_code: parsed.data.code,
        access_code_overridden_by_host: true,
      },
      {
        access_code: parsed.data.code,
      },
    ] as const
    let updateError: string | null = null
    for (const updatePayload of updateCandidates) {
      const attempt = await admin.from("bookings").update(updatePayload).eq("id", booking.id)
      if (!attempt.error) {
        updateError = null
        break
      }
      updateError = attempt.error.message
      if (!isMissingColumnError(attempt.error.message)) break
    }
    if (updateError) return NextResponse.json({ error: updateError }, { status: 500 })

    const shouldSend = parsed.data.send === true
    if (shouldSend) {
      const sendResult = await sendAccessCode(booking.id)
      if (!sendResult.sent) {
        return NextResponse.json({ error: sendResult.error ?? "Unable to send access code" }, { status: 500 })
      }
    }

    const refreshedAttempt = await admin
      .from("bookings")
      .select("access_code, access_code_sent_at")
      .eq("id", booking.id)
      .maybeSingle()
    const refreshed = (() => {
      if (!refreshedAttempt.error) return refreshedAttempt.data
      if (isMissingColumnError(refreshedAttempt.error.message)) {
        return { access_code: parsed.data.code, access_code_sent_at: null }
      }
      return null
    })()
    if (!refreshed) {
      return NextResponse.json({ error: refreshedAttempt.error?.message ?? "Unable to verify save" }, { status: 500 })
    }

    return NextResponse.json({
      saved: true,
      access_code: typeof refreshed.access_code === "string" ? refreshed.access_code : parsed.data.code,
      sent: shouldSend,
      access_code_sent_at:
        typeof refreshed.access_code_sent_at === "string" ? refreshed.access_code_sent_at : null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

