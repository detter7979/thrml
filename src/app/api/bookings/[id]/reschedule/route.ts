import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { rescheduleBooking } from "@/lib/bookings/reschedule-booking"
import {
  buildRescheduleSlotOptions,
  loadBookedIntervalsForDate,
  loadListingAvailability,
} from "@/lib/bookings/reschedule-slots"
import { requireAuth } from "@/lib/auth-check"
import { rateLimit } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"

type Params = { id: string }

const postSchema = z.object({
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().min(4),
  endTime: z.string().min(4),
  requested_by: z.enum(["guest", "host"]),
  reason: z.string().trim().max(500).optional(),
})

const RESCHEDULABLE = new Set(["confirmed", "pending_host"])

export async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const limited = await rateLimit(req, { maxRequests: 40, windowMs: 60 * 1000, identifier: "bookings" })
  if (limited) return limited

  const { id } = await params
  const sessionDate = req.nextUrl.searchParams.get("date")?.trim() ?? ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return NextResponse.json({ error: "date query param required (YYYY-MM-DD)" }, { status: 400 })
  }

  const { error: authError, session } = await requireAuth()
  if (authError || !session) {
    return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: booking, error } = await admin
    .from("bookings")
    .select("id, listing_id, guest_id, host_id, status, duration_hours, session_date, start_time")
    .eq("id", id)
    .or(`guest_id.eq.${session.user.id},host_id.eq.${session.user.id}`)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  if (!RESCHEDULABLE.has(String(booking.status))) {
    return NextResponse.json({ error: "Booking cannot be rescheduled" }, { status: 409 })
  }

  const listingId = booking.listing_id as string
  const { availability, durationMinutes, slotIncrement, minMins } = await loadListingAvailability(admin, listingId)
  const booked = await loadBookedIntervalsForDate(admin, listingId, sessionDate, id)
  const slots = buildRescheduleSlotOptions({
    availability,
    sessionDate,
    durationMinutes,
    slotIncrement,
    minMins,
    booked,
  })

  return NextResponse.json({
    date: sessionDate,
    durationMinutes,
    currentSessionDate: booking.session_date,
    currentStartTime: booking.start_time,
    slots,
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const limited = await rateLimit(req, { maxRequests: 20, windowMs: 60 * 1000, identifier: "bookings" })
  if (limited) return limited

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 })
  }

  const { error: authError, session } = await requireAuth()
  if (authError || !session) {
    return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const result = await rescheduleBooking({
    admin,
    bookingId: id,
    actorUserId: session.user.id,
    requestedBy: parsed.data.requested_by,
    sessionDate: parsed.data.sessionDate,
    startTime: parsed.data.startTime,
    endTime: parsed.data.endTime,
    reason: parsed.data.reason,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ booking: result.booking })
}
