import { NextRequest, NextResponse } from "next/server"

import { sendAccessCode } from "@/lib/access/send-access-code"
import { sendAutomatedBookingConfirmedByHostMessage } from "@/lib/automated-messages"
import { requireAuth } from "@/lib/auth-check"
import {
  sendGuestBookingConfirmedEmail,
  sendGuestBookingPaymentCaptureFailedEmail,
  sendHostBookingConfirmedEmail,
} from "@/lib/emails"
import { rateLimit } from "@/lib/rate-limit"
import { stripe } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/admin"

type Params = { id: string }

function isCodeAccessType(value: unknown) {
  return (
    typeof value === "string" &&
    ["code", "lockbox", "smart_lock"].includes(value.trim().toLowerCase())
  )
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const limited = rateLimit(req, {
    maxRequests: 20,
    windowMs: 60 * 1000,
    identifier: "bookings",
  })
  if (limited) return limited

  const { id } = await params
  const { error: authError, session } = await requireAuth()
  if (authError || !session) {
    return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const admin = createAdminClient()

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select(
      "id, listing_id, guest_id, host_id, status, stripe_payment_intent_id, confirmation_deadline, host_payout, total_charged, session_date, start_time, end_time, duration_hours, guest_count, access_code"
    )
    .eq("id", id)
    .maybeSingle()
  if (bookingError || !booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  if (booking.status !== "pending_host") {
    return NextResponse.json({ error: "Booking is not awaiting host confirmation" }, { status: 409 })
  }
  if (booking.confirmation_deadline) {
    const deadline = new Date(booking.confirmation_deadline).getTime()
    if (Number.isFinite(deadline) && deadline < Date.now()) {
      return NextResponse.json({ error: "Confirmation deadline has passed" }, { status: 409 })
    }
  }
  if (!booking.stripe_payment_intent_id) {
    return NextResponse.json({ error: "Missing payment authorization" }, { status: 400 })
  }

  let paymentIntentStatus: string | null = null
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id)
    paymentIntentStatus = paymentIntent.status
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify payment authorization"
    return NextResponse.json({ error: message }, { status: 502 })
  }

  if (
    paymentIntentStatus === "requires_payment_method" ||
    paymentIntentStatus === "requires_confirmation" ||
    paymentIntentStatus === "requires_action" ||
    paymentIntentStatus === "processing"
  ) {
    return NextResponse.json(
      {
        error:
          "Guest payment is not authorized yet. Ask the guest to complete checkout again, then retry confirmation.",
      },
      { status: 409 }
    )
  }

  if (paymentIntentStatus === "canceled") {
    await admin
      .from("bookings")
      .update({
        status: "cancelled",
        host_actioned_at: new Date().toISOString(),
        host_decline_reason: "payment_authorization_expired",
      })
      .eq("id", booking.id)
      .eq("status", "pending_host")
    await admin.from("booked_slots").delete().eq("booking_id", booking.id)
    return NextResponse.json(
      { error: "Payment authorization expired. The booking request has been cancelled." },
      { status: 409 }
    )
  }

  const { data: listing } = await admin
    .from("listings")
    .select(
      "id, host_id, title, access_type, access_instructions, access_code_send_timing, city, state, cancellation_policy, service_type"
    )
    .eq("id", booking.listing_id)
    .maybeSingle()

  const isListingHost = Boolean(listing && listing.host_id === session.user.id)
  const isBookingHost = booking.host_id === session.user.id
  if (!isListingHost && !isBookingHost) {
    return NextResponse.json(
      { error: "Forbidden: you are not the host for this booking request." },
      { status: 403 }
    )
  }

  const listingRecord = listing ?? {
    id: booking.listing_id,
    host_id: session.user.id,
    title: "Thrml session",
    access_type: null,
    access_instructions: null,
    access_code_send_timing: null,
    city: null,
    state: null,
    cancellation_policy: null,
    service_type: "sauna",
  }

  const hostId = booking.host_id === session.user.id ? booking.host_id : session.user.id
  if (hostId !== booking.host_id) {
    await admin.from("bookings").update({ host_id: hostId }).eq("id", booking.id).eq("status", "pending_host")
  }

  const [{ data: guestProfile }, { data: hostProfile }, hostAuthUser, guestAuthUser] = await Promise.all([
    admin.from("profiles").select("id, full_name").eq("id", booking.guest_id).maybeSingle(),
    admin.from("profiles").select("id, full_name").eq("id", hostId).maybeSingle(),
    admin.auth.admin.getUserById(hostId),
    admin.auth.admin.getUserById(booking.guest_id),
  ])

  if (paymentIntentStatus !== "succeeded") {
    try {
      await stripe.paymentIntents.capture(booking.stripe_payment_intent_id)
    } catch (error) {
      await admin
        .from("bookings")
        .update({
          status: "cancelled",
          host_actioned_at: new Date().toISOString(),
          host_decline_reason: "payment_capture_failed",
        })
        .eq("id", booking.id)
        .eq("status", "pending_host")
      await admin.from("booked_slots").delete().eq("booking_id", booking.id)

      await sendGuestBookingPaymentCaptureFailedEmail({
        booking_id: booking.id,
        listing_title: listingRecord.title ?? "Thrml session",
        listing_id: booking.listing_id,
        service_type: listingRecord.service_type ?? "sauna",
        session_date: booking.session_date ?? null,
        start_time: booking.start_time ?? null,
        end_time: booking.end_time ?? null,
        guest_count: Number(booking.guest_count ?? 1),
        total_charged: Number(booking.total_charged ?? 0),
        host_payout: Number(booking.host_payout ?? 0),
        guest_id: booking.guest_id,
        guest_name: guestProfile?.full_name ?? null,
        guest_email: guestAuthUser.data.user?.email ?? null,
      host_id: hostId,
        host_name: hostProfile?.full_name ?? null,
        host_email: hostAuthUser.data.user?.email ?? null,
        confirmation_deadline: booking.confirmation_deadline ?? null,
      })
      const message = error instanceof Error ? error.message : "Payment capture failed"
      return NextResponse.json({ error: message }, { status: 402 })
    }
  }

  const { error: updateError } = await admin
    .from("bookings")
    .update({
      status: "confirmed",
      host_actioned_at: new Date().toISOString(),
    })
    .eq("id", booking.id)
    .eq("status", "pending_host")
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await admin.from("booked_slots").update({ status: "confirmed" }).eq("booking_id", booking.id)

  const hostEmail = hostAuthUser.data.user?.email ?? null
  const guestEmail = guestAuthUser.data.user?.email ?? null
  const listingAccessType = (listingRecord as Record<string, unknown>).access_type ?? null
  const shouldIncludeCode = isCodeAccessType(listingAccessType) && Boolean(booking.access_code)

  try {
    await Promise.all([
      sendHostBookingConfirmedEmail({
        booking_id: booking.id,
        guest_id: booking.guest_id,
        host_id: hostId,
        listing_title: listingRecord.title ?? null,
        listing_access_type: typeof listingAccessType === "string" ? listingAccessType : null,
        listing_access_instructions:
          typeof listingRecord.access_instructions === "string" ? listingRecord.access_instructions : null,
        listing_location_label: [listingRecord.city, listingRecord.state]
          .filter((part): part is string => typeof part === "string" && part.length > 0)
          .join(", "),
        listing_cancellation_policy:
          typeof listingRecord.cancellation_policy === "string" ? listingRecord.cancellation_policy : null,
        session_date: booking.session_date ?? null,
        start_time: booking.start_time ?? null,
        end_time: booking.end_time ?? null,
        duration_hours: Number(booking.duration_hours ?? 1),
        guest_count: Number(booking.guest_count ?? 1),
        total_charged: Number(booking.total_charged ?? 0),
        host_payout: Number(booking.host_payout ?? 0),
        access_code: shouldIncludeCode ? booking.access_code : null,
        guest_name: guestProfile?.full_name ?? null,
        guest_email: guestEmail,
        host_name: hostProfile?.full_name ?? null,
        host_email: hostEmail,
      }),
      sendGuestBookingConfirmedEmail({
        booking_id: booking.id,
        guest_id: booking.guest_id,
        host_id: hostId,
        listing_title: listingRecord.title ?? null,
        listing_access_type: typeof listingAccessType === "string" ? listingAccessType : null,
        listing_access_code_send_timing:
          typeof (listingRecord as Record<string, unknown>).access_code_send_timing === "string"
            ? ((listingRecord as Record<string, unknown>).access_code_send_timing as string)
            : null,
        listing_access_instructions:
          typeof listingRecord.access_instructions === "string" ? listingRecord.access_instructions : null,
        listing_location_label: [listingRecord.city, listingRecord.state]
          .filter((part): part is string => typeof part === "string" && part.length > 0)
          .join(", "),
        listing_cancellation_policy:
          typeof listingRecord.cancellation_policy === "string" ? listingRecord.cancellation_policy : null,
        session_date: booking.session_date ?? null,
        start_time: booking.start_time ?? null,
        end_time: booking.end_time ?? null,
        duration_hours: Number(booking.duration_hours ?? 1),
        guest_count: Number(booking.guest_count ?? 1),
        total_charged: Number(booking.total_charged ?? 0),
        host_payout: Number(booking.host_payout ?? 0),
        access_code: shouldIncludeCode ? booking.access_code : null,
        guest_name: guestProfile?.full_name ?? null,
        guest_email: guestEmail,
        host_name: hostProfile?.full_name ?? null,
        host_email: hostEmail,
      }),
      sendAutomatedBookingConfirmedByHostMessage({
        bookingId: booking.id,
        listingId: booking.listing_id,
        guestId: booking.guest_id,
        hostId,
        hostName: hostProfile?.full_name?.split(" ")[0] ?? "your host",
      }),
    ])
  } catch (emailError) {
    console.error("[bookings/confirm] confirmation email failed", emailError)
  }

  const timing =
    typeof (listingRecord as Record<string, unknown>).access_code_send_timing === "string"
      ? ((listingRecord as Record<string, unknown>).access_code_send_timing as string)
      : null
  if (timing === "on_confirm") {
    void sendAccessCode(booking.id)
  } else if (timing === "24h_before" || timing === "1h_before") {
    console.log("[bookings/confirm] Access code queued for cron send", { bookingId: booking.id, timing })
  }

  return NextResponse.json({ status: "confirmed" })
}
