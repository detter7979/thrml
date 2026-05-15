import type { SupabaseClient } from "@supabase/supabase-js"

import { hoursUntilSession, parseSessionStart } from "@/lib/cancellations"
import { withinAvailability } from "@/lib/bookings/listing-availability"
import {
  buildRescheduleSlotOptions,
  loadBookedIntervalsForDate,
  loadListingAvailability,
  validateRescheduleTimes,
} from "@/lib/bookings/reschedule-slots"
import { sendBookingRescheduledEmails } from "@/lib/emails/reschedule"

const RESCHEDULABLE_STATUSES = new Set(["confirmed", "pending_host"])

function parseMissingColumn(message: string) {
  const match = message.match(/'([^']+)' column/i)
  return match?.[1] ?? null
}

export type RescheduleBookingParams = {
  admin: SupabaseClient
  bookingId: string
  actorUserId: string
  requestedBy: "guest" | "host"
  sessionDate: string
  startTime: string
  endTime: string
  reason?: string
}

export type RescheduleBookingResult =
  | { ok: true; booking: Record<string, unknown> }
  | { ok: false; status: number; error: string }

export async function rescheduleBooking(params: RescheduleBookingParams): Promise<RescheduleBookingResult> {
  const { admin, bookingId, actorUserId, requestedBy, sessionDate, startTime, endTime, reason } = params

  const { data: booking, error: bookingError } = await admin.from("bookings").select("*").eq("id", bookingId).single()
  if (bookingError || !booking) {
    return { ok: false, status: 404, error: "Booking not found" }
  }

  const status = typeof booking.status === "string" ? booking.status : ""
  if (!RESCHEDULABLE_STATUSES.has(status)) {
    return { ok: false, status: 409, error: "Only confirmed or pending bookings can be rescheduled" }
  }

  const isGuest = booking.guest_id === actorUserId
  const isHost = booking.host_id === actorUserId
  if (requestedBy === "guest" && !isGuest) {
    return { ok: false, status: 403, error: "Forbidden" }
  }
  if (requestedBy === "host" && !isHost) {
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", actorUserId).maybeSingle()
    if (!profile?.is_admin) {
      return { ok: false, status: 403, error: "Forbidden" }
    }
  }

  const currentStart = parseSessionStart(booking.session_date, booking.start_time)
  if (!currentStart || currentStart.getTime() <= Date.now()) {
    return { ok: false, status: 409, error: "Cannot reschedule a session that has already started" }
  }

  const hoursUntil = hoursUntilSession(currentStart)
  if (requestedBy === "guest" && hoursUntil < 24) {
    return {
      ok: false,
      status: 409,
      error: "Guest reschedules must be made at least 24 hours before the session",
    }
  }

  const durationHours = Number(booking.duration_hours ?? 1)
  const expectedDurationMinutes = Math.max(30, Math.round(durationHours * 60))
  const timeCheck = validateRescheduleTimes({
    sessionDate,
    startTime,
    endTime,
    expectedDurationMinutes,
  })
  if (!timeCheck.ok) {
    return { ok: false, status: 400, error: timeCheck.error }
  }

  const listingId = booking.listing_id as string
  const { availability, durationMinutes, slotIncrement, minMins } = await loadListingAvailability(admin, listingId)

  if (!withinAvailability(availability, sessionDate, startTime, endTime)) {
    return { ok: false, status: 400, error: "Selected time is outside host availability" }
  }

  const { data: blackout } = await admin
    .from("listing_blackout_dates")
    .select("id")
    .eq("listing_id", listingId)
    .eq("blackout_date", sessionDate)
    .maybeSingle()
  if (blackout?.id) {
    return { ok: false, status: 400, error: "This date is not available" }
  }

  const booked = await loadBookedIntervalsForDate(admin, listingId, sessionDate, bookingId)
  const options = buildRescheduleSlotOptions({
    availability,
    sessionDate,
    durationMinutes,
    slotIncrement,
    minMins,
    booked,
    minLeadMinutes: 120,
  })

  const slotOk = options.some((slot) => slot.startTime === startTime && slot.endTime === endTime)
  if (!slotOk) {
    return { ok: false, status: 409, error: "This time slot is no longer available" }
  }

  const updatePayload: Record<string, unknown> = {
    session_date: sessionDate,
    start_time: startTime,
    end_time: endTime,
    updated_at: new Date().toISOString(),
    rescheduled_at: new Date().toISOString(),
    rescheduled_by: requestedBy,
    reschedule_reason: reason?.trim() || null,
    previous_session_date: booking.session_date ?? null,
    previous_start_time: booking.start_time ?? null,
    previous_end_time: booking.end_time ?? null,
    reminder_24h_sent: false,
    access_code_sent: false,
    access_code_sent_at: null,
    post_session_email_sent: false,
  }

  if (status === "pending_host") {
    updatePayload.confirmation_deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }

  let updatedBooking: Record<string, unknown> | null = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data, error } = await admin
      .from("bookings")
      .update(updatePayload)
      .eq("id", bookingId)
      .in("status", Array.from(RESCHEDULABLE_STATUSES))
      .select("*")
      .maybeSingle()

    if (!error && data) {
      updatedBooking = data as Record<string, unknown>
      break
    }

    const missingColumn = parseMissingColumn(error?.message ?? "")
    if (missingColumn && missingColumn in updatePayload) {
      delete updatePayload[missingColumn]
      continue
    }
    return { ok: false, status: 500, error: error?.message ?? "Unable to reschedule booking" }
  }

  if (!updatedBooking) {
    return { ok: false, status: 409, error: "Booking could not be rescheduled" }
  }

  const slotStatus = status === "confirmed" ? "confirmed" : "pending_payment"
  const { data: existingSlot } = await admin
    .from("booked_slots")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle()

  if (existingSlot?.id) {
    await admin
      .from("booked_slots")
      .update({
        session_date: sessionDate,
        start_time: startTime,
        end_time: endTime,
        status: slotStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingSlot.id)
  } else {
    await admin.from("booked_slots").insert({
      listing_id: listingId,
      guest_id: booking.guest_id,
      booking_id: bookingId,
      session_date: sessionDate,
      start_time: startTime,
      end_time: endTime,
      status: slotStatus,
    })
  }

  const { data: listing } = await admin
    .from("listings")
    .select("id, title, service_type")
    .eq("id", listingId)
    .maybeSingle()
  const [guestAuth, hostAuth] = await Promise.all([
    admin.auth.admin.getUserById(booking.guest_id as string),
    admin.auth.admin.getUserById(booking.host_id as string),
  ])

  try {
    await sendBookingRescheduledEmails({
      booking: updatedBooking,
      listingTitle: (listing?.title as string | null) ?? "Thrml session",
      guestEmail: guestAuth.data.user?.email ?? null,
      hostEmail: hostAuth.data.user?.email ?? null,
      requestedBy,
      previousSessionDate: (booking.session_date as string | null) ?? null,
      previousStartTime: (booking.start_time as string | null) ?? null,
      previousEndTime: (booking.end_time as string | null) ?? null,
    })
  } catch (emailError) {
    console.error("[reschedule] notification email failed", emailError)
  }

  return { ok: true, booking: updatedBooking }
}
