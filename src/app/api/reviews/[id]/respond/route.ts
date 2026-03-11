import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { sanitizeText } from "@/lib/sanitize"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

type Params = { id: string }

const respondSchema = z.object({
  response: z.string().trim().min(1).max(500),
})

export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { id } = await params
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = respondSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })

  const { data: review, error: reviewError } = await admin
    .from("listing_reviews")
    .select("id, host_id, listing_id, booking_id")
    .eq("id", id)
    .maybeSingle()

  if (reviewError) return NextResponse.json({ error: reviewError.message }, { status: 500 })
  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 })

  let hostId = typeof review.host_id === "string" ? review.host_id : null
  if (!hostId && typeof review.booking_id === "string") {
    const { data: booking } = await admin.from("bookings").select("host_id").eq("id", review.booking_id).maybeSingle()
    hostId = typeof booking?.host_id === "string" ? booking.host_id : null
  }
  if (!hostId && typeof review.listing_id === "string") {
    const { data: listing } = await admin.from("listings").select("host_id").eq("id", review.listing_id).maybeSingle()
    hostId = typeof listing?.host_id === "string" ? listing.host_id : null
  }

  if (!hostId || hostId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const payload: Record<string, unknown> = {
    host_response: sanitizeText(parsed.data.response),
    host_responded_at: new Date().toISOString(),
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.from("listing_reviews").update(payload).eq("id", id).select("*").single()
    if (!error) return NextResponse.json({ review: data })

    const message = error.message ?? ""
    const missing = message.match(/'([^']+)' column/i)?.[1]
    if (!missing || !(missing in payload)) {
      return NextResponse.json({ error: message || "Failed to post response" }, { status: 500 })
    }
    delete payload[missing]
  }

  return NextResponse.json({ error: "Failed to post response" }, { status: 500 })
}
