import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { shouldMarkBookingCompleted } from "@/lib/booking-session"
import { applyMemoryRateLimit, requestIp } from "@/lib/security"
import { sanitizeText } from "@/lib/sanitize"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const guestReviewSchema = z.object({
  bookingId: z.string().uuid(),
  ratingOverall: z.number().int().min(1).max(5),
  comment: z.string().max(1000).nullable().optional(),
})

export async function POST(req: NextRequest) {
  const ip = requestIp(req)
  const limit = await applyMemoryRateLimit({
    key: `api:guest-reviews:create:${ip}`,
    max: 10,
    windowMs: 10 * 60_000,
  })
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many review submissions. Please try again later." }, { status: 429 })
  }

  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = guestReviewSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, guest_id, host_id, listing_id, status, session_date, start_time, end_time")
    .eq("id", parsed.data.bookingId)
    .maybeSingle()

  if (!booking || booking.host_id !== user.id) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  let bookingStatus = typeof booking.status === "string" ? booking.status : ""
  if (bookingStatus === "confirmed" && shouldMarkBookingCompleted(booking)) {
    const { data: transitioned } = await admin
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", parsed.data.bookingId)
      .eq("host_id", user.id)
      .eq("status", "confirmed")
      .select("id")
      .maybeSingle()
    if (transitioned?.id) {
      bookingStatus = "completed"
    } else {
      const { data: fresh } = await supabase
        .from("bookings")
        .select("status")
        .eq("id", parsed.data.bookingId)
        .eq("host_id", user.id)
        .maybeSingle()
      if (fresh && typeof fresh.status === "string" && fresh.status === "completed") {
        bookingStatus = "completed"
      }
    }
  }

  if (bookingStatus !== "completed") {
    return NextResponse.json({ error: "Only completed bookings can be reviewed" }, { status: 409 })
  }

  const { data: existingReview } = await supabase
    .from("guest_reviews")
    .select("id")
    .eq("booking_id", parsed.data.bookingId)
    .maybeSingle()

  if (existingReview?.id) {
    return NextResponse.json({ error: "Review already exists for this booking" }, { status: 409 })
  }

  const payload: Record<string, unknown> = {
    booking_id: parsed.data.bookingId,
    listing_id: booking.listing_id,
    host_id: user.id,
    guest_id: booking.guest_id,
    rating_overall: parsed.data.ratingOverall,
    comment: parsed.data.comment ? sanitizeText(parsed.data.comment) || null : null,
  }

  let insertedReview: { id: string } | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await admin.from("guest_reviews").insert(payload).select("id").single()
    if (!error) {
      insertedReview = { id: typeof data?.id === "string" ? data.id : "" }
      break
    }

    const message = error.message ?? ""
    const missingMatch = message.match(/'([^']+)' column/i)
    const missingColumn = missingMatch?.[1]
    if (!missingColumn || !(missingColumn in payload)) {
      return NextResponse.json({ error: message || "Failed to create review" }, { status: 500 })
    }
    delete payload[missingColumn]
  }

  if (!insertedReview?.id) {
    return NextResponse.json({ error: "Failed to create review" }, { status: 500 })
  }

  await admin
    .from("bookings")
    .update({ host_review_submitted: true })
    .eq("id", parsed.data.bookingId)
    .eq("host_id", user.id)

  return NextResponse.json({ review_id: insertedReview.id }, { status: 201 })
}
