/** Shared session timing for bookings (dashboard grouping, auto-complete, reviews). */

export type BookingSessionFields = {
  session_date?: string | null
  start_time?: string | null
  end_time?: string | null
  status?: string | null
}

export function parseBookingSessionEnd(booking: BookingSessionFields): Date | null {
  const sessionDate = typeof booking.session_date === "string" ? booking.session_date : null
  if (!sessionDate) return null
  const endTime =
    typeof booking.end_time === "string" && booking.end_time
      ? booking.end_time
      : typeof booking.start_time === "string" && booking.start_time
        ? booking.start_time
        : "23:59"
  const parsed = new Date(`${sessionDate}T${endTime}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** True once the session window has fully ended (compare to full `now`, not calendar midnight). */
export function bookingSessionHasEnded(booking: BookingSessionFields, now: Date = new Date()): boolean {
  const endsAt = parseBookingSessionEnd(booking)
  if (!endsAt) return false
  return endsAt.getTime() < now.getTime()
}

/** Guest may see a booking under “past sessions” and leave a review when appropriate. */
export function guestCompletedTabBooking(booking: BookingSessionFields, now: Date = new Date()): boolean {
  const status = typeof booking.status === "string" ? booking.status : ""
  if (status === "completed") return true
  if (status === "confirmed" && bookingSessionHasEnded(booking, now)) return true
  return false
}

/** Matches GET /api/bookings auto-complete rule. */
export function shouldMarkBookingCompleted(booking: BookingSessionFields, now: Date = new Date()): boolean {
  const status = typeof booking.status === "string" ? booking.status : ""
  if (status !== "confirmed") return false
  return bookingSessionHasEnded(booking, now)
}
