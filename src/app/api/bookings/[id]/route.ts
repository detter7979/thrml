import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAuth } from "@/lib/auth-check"
import { rateLimit } from "@/lib/rate-limit"
import { isUuid } from "@/lib/security"

type Params = { id: string }
const bookingIdSchema = z.string().uuid()

const BOOKING_SELECT_CANDIDATES = [
  "id, listing_id, host_id, guest_id, session_date, start_time, end_time, duration_hours, guest_count, status, subtotal, service_fee, total_charged, price_per_person, access_code, access_code_sent_at, waiver_version, waiver_accepted_at, refund_amount, refund_status, refunded_amount, refunded_at, review_submitted, created_at, updated_at",
  "id, listing_id, host_id, guest_id, session_date, start_time, end_time, duration_hours, guest_count, status, subtotal, service_fee, total_charged, price_per_person, access_code, waiver_version, waiver_accepted_at, refund_amount, refund_status, refunded_amount, refunded_at, review_submitted, created_at, updated_at",
] as const

function isMissingColumnError(message: string) {
  const normalized = message.toLowerCase()
  return (
    (normalized.includes("column") && normalized.includes("does not exist")) ||
    (normalized.includes("could not find") &&
      normalized.includes("column") &&
      normalized.includes("schema cache"))
  )
}

export async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const limited = await rateLimit(req, {
    maxRequests: 20,
    windowMs: 60 * 1000,
    identifier: "bookings",
  })
  if (limited) return limited

  const { id } = await params
  console.log("stripe route hit", id)
  if (!bookingIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid booking id" }, { status: 400 })
  }

  const { error: authError, session, supabase } = await requireAuth()
  if (authError || !session || !supabase) {
    return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let data: Record<string, unknown> | null = null
  let error: { message: string } | null = null
  for (const select of BOOKING_SELECT_CANDIDATES) {
    const attempt = await supabase
      .from("bookings")
      .select(select)
      .eq("id", id)
      .or(`guest_id.eq.${session.user.id},host_id.eq.${session.user.id}`)
      .maybeSingle()
    if (!attempt.error) {
      data = attempt.data as Record<string, unknown> | null
      error = null
      break
    }
    if (!isMissingColumnError(attempt.error.message)) {
      error = { message: attempt.error.message }
      break
    }
    error = { message: attempt.error.message }
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  if (!data) return NextResponse.json({ error: "Booking not found" }, { status: 404 })

  return NextResponse.json({ booking: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const limited = await rateLimit(req, {
    maxRequests: 20,
    windowMs: 60 * 1000,
    identifier: "bookings",
  })
  if (limited) return limited

  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid booking id" }, { status: 400 })
  }

  await req.text()
  const { error: authError, session, supabase } = await requireAuth()
  if (authError || !session || !supabase) {
    return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", id)
    .or(`guest_id.eq.${session.user.id},host_id.eq.${session.user.id}`)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })

  return NextResponse.json(
    {
      error:
        "Direct booking updates are disabled. Use dedicated booking action endpoints (cancel/refund/webhook).",
    },
    { status: 405 }
  )
}
