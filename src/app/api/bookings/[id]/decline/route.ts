import { NextRequest, NextResponse } from "next/server"

import { sendAutomatedBookingDeclinedMessage } from "@/lib/automated-messages"
import { requireAuth } from "@/lib/auth-check"
import { sendGuestBookingRequestDeclinedEmail } from "@/lib/emails"
import { rateLimit } from "@/lib/rate-limit"
import { stripe } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/admin"

type Params = { id: string }

const DECLINE_REASON_OPTIONS = new Set([
  "Space unavailable",
  "Dates no longer available",
  "Guest requirements don't match",
  "Other",
])

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const limited = await rateLimit(req, {
    maxRequests: 20,
    windowMs: 60 * 1000,
    identifier: "bookings",
  })
  if (limited) return limited

  const { id } = await params
  const payload = (await req.json().catch(() => null)) as { reason?: string } | null
  const declineReasonRaw = typeof payload?.reason === "string" ? payload.reason.trim() : ""
  const declineReason = declineReasonRaw
    ? DECLINE_REASON_OPTIONS.has(declineReasonRaw)
      ? declineReasonRaw
      : "Other"
    : null

  const { error: authError, session } = await requireAuth()
  if (authError || !session) {
    return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const admin = createAdminClient()

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select(
      "id, listing_id, guest_id, host_id, status, stripe_payment_intent_id, host_payout, total_charged, session_date, start_time, end_time, duration_hours, guest_count, confirmation_deadline"
    )
    .eq("id", id)
    .maybeSingle()
  if (bookingError || !booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  if (booking.host_id !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (booking.status !== "pending_host") {
    return NextResponse.json({ error: "Booking is not awaiting host confirmation" }, { status: 409 })
  }

  const [{ data: listing }, { data: guestProfile }, { data: hostProfile }, hostAuthUser, guestAuthUser] =
    await Promise.all([
      admin.from("listings").select("id, host_id, title, service_type").eq("id", booking.listing_id).maybeSingle(),
      admin.from("profiles").select("id, full_name").eq("id", booking.guest_id).maybeSingle(),
      admin.from("profiles").select("id, full_name").eq("id", booking.host_id).maybeSingle(),
      admin.auth.admin.getUserById(booking.host_id),
      admin.auth.admin.getUserById(booking.guest_id),
    ])
  if (!listing || listing.host_id !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (booking.stripe_payment_intent_id) {
    try {
      await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to release authorization hold"
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  const { error: updateError } = await admin
    .from("bookings")
    .update({
      status: "declined",
      host_actioned_at: new Date().toISOString(),
      host_decline_reason: declineReason,
    })
    .eq("id", booking.id)
    .eq("status", "pending_host")
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await admin.from("booked_slots").delete().eq("booking_id", booking.id)

  void Promise.allSettled([
    sendGuestBookingRequestDeclinedEmail({
      booking_id: booking.id,
      listing_title: listing.title ?? "Thrml session",
      listing_id: booking.listing_id,
      service_type: listing.service_type ?? "sauna",
      session_date: booking.session_date ?? null,
      start_time: booking.start_time ?? null,
      end_time: booking.end_time ?? null,
      guest_count: Number(booking.guest_count ?? 1),
      total_charged: Number(booking.total_charged ?? 0),
      host_payout: Number(booking.host_payout ?? 0),
      guest_id: booking.guest_id,
      guest_name: guestProfile?.full_name ?? null,
      guest_email: guestAuthUser.data.user?.email ?? null,
      host_id: booking.host_id,
      host_name: hostProfile?.full_name ?? null,
      host_email: hostAuthUser.data.user?.email ?? null,
      confirmation_deadline: booking.confirmation_deadline ?? null,
      host_decline_reason: declineReason,
    }),
    sendAutomatedBookingDeclinedMessage({
      bookingId: booking.id,
      listingId: booking.listing_id,
      guestId: booking.guest_id,
      hostId: booking.host_id,
      hostName: hostProfile?.full_name?.split(" ")[0] ?? "your host",
    }),
  ])

  return NextResponse.json({ status: "declined" })
}
