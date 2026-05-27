import { formatMoney } from "@/lib/cancellations"
import { formatBookingTime } from "@/lib/emails/send"
import { sendThrmlLayoutEmail, THRML_APP_URL } from "@/lib/emails/transactional-send"
import type { SummaryRow } from "@/lib/emails/render-layout"

const APP_URL = THRML_APP_URL

type BookingEmailPayload = {
  id: string
  guest_id?: string | null
  host_id?: string | null
  session_date: string | null
  start_time: string | null
  end_time: string | null
  total_charged: number | null
  host_payout?: number | null
  guest_count?: number | null
  guest_name: string | null
  guest_email: string | null
  host_name: string | null
  host_email: string | null
  listing_title: string | null
  service_type: string | null
  listing_id?: string | null
  listing_access_type?: string | null
  listing_location_label?: string | null
  listing_access_instructions?: string | null
  access_code?: string | null
  cancellation_policy?: string | null
  cancellation_reason?: string | null
}

type HostPenaltyEmailPayload = {
  penaltyAmount: number
  policyApplied: string
}

type BookingConfirmedEmailPayload = {
  booking_id: string
  guest_id?: string | null
  host_id?: string | null
  listing_title: string | null
  service_type?: string | null
  listing_access_type: string | null
  listing_access_code_send_timing?: string | null
  listing_location_label?: string | null
  listing_access_instructions?: string | null
  listing_cancellation_policy?: string | null
  session_date: string | null
  start_time: string | null
  end_time: string | null
  duration_hours: number | null
  guest_count: number | null
  total_charged: number | null
  host_payout: number | null
  access_code: string | null
  guest_name: string | null
  guest_email: string | null
  host_name: string | null
  host_email: string | null
}

type BookingRequestEmailPayload = {
  booking_id: string
  listing_title: string | null
  listing_id?: string | null
  service_type?: string | null
  session_date: string | null
  start_time: string | null
  end_time: string | null
  guest_count: number | null
  total_charged: number | null
  host_payout: number | null
  guest_id?: string | null
  guest_name: string | null
  guest_email: string | null
  host_id?: string | null
  host_name: string | null
  host_email: string | null
  confirmation_deadline: string | null
  host_decline_reason?: string | null
}

function firstName(fullName: string | null | undefined, fallback = "there") {
  const normalized = (fullName ?? "").trim()
  if (!normalized) return fallback
  return normalized.split(" ")[0] ?? fallback
}

function formatLongDate(date: string | null) {
  if (!date) return "Date TBD"
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return "Date TBD"
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parsed)
}

function formatTimeRange(sessionDate: string | null, startTime: string | null, endTime: string | null) {
  if (!sessionDate || !startTime || !endTime) return "Time TBD"
  const start = new Date(`${sessionDate}T${startTime}`)
  const end = new Date(`${sessionDate}T${endTime}`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Time TBD"
  const formatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })
  return `${formatter.format(start)} - ${formatter.format(end)}`
}

function formatDateTime(value: string | null) {
  if (!value) return "within 24 hours"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "within 24 hours"
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed)
}

function formatUsd(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value ?? 0))
}

function serviceEmoji(serviceType: string | null | undefined) {
  const key = (serviceType ?? "").toLowerCase()
  if (key.includes("cold")) return "🧊"
  if (key.includes("float")) return "🌊"
  if (key.includes("massage")) return "💆"
  if (key.includes("yoga")) return "🧘"
  return "🔥"
}

function formatBookingWindow(sessionDate: string | null, startTime: string | null, endTime: string | null) {
  if (!sessionDate || !startTime || !endTime) return "Time TBD"
  return formatBookingTime(`${sessionDate}T${startTime}`, `${sessionDate}T${endTime}`)
}

function normalizeAccessType(value: string | null | undefined) {
  const key = (value ?? "").trim().toLowerCase()
  if (key === "host_present" || key === "keypick") return "host_onsite"
  if (key === "smart_lock") return "code"
  return key
}

function policyReminder(cancellationPolicy: string | null | undefined) {
  const key = (cancellationPolicy ?? "").trim().toLowerCase()
  if (key === "strict") return "Free cancellation up to 72 hours before your session."
  if (key === "moderate") return "Free cancellation up to 48 hours before your session."
  return "Free cancellation up to 24 hours before your session."
}

export async function sendGuestCancellationConfirmation(
  booking: BookingEmailPayload,
  refundAmount: number
) {
  if (!booking.guest_email) return { sent: false, error: "Missing guest email" }
  const title = booking.listing_title ?? "Thrml session"
  const refundLine =
    refundAmount > 0
      ? `A refund of ${formatUsd(refundAmount)} will appear on your statement within 5-10 business days.`
      : "This booking was cancelled within 48 hours of the session and is not eligible for a refund per our cancellation policy."
  const when = formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)

  return sendThrmlLayoutEmail({
    to: booking.guest_email,
    subject: `Booking cancelled — ${title}`,
    userId: booking.guest_id ?? null,
    preferenceKey: "booking_cancelled",
    layout: {
      preview: `Booking cancelled — ${title}`,
      kicker: "Booking cancelled",
      title: "Your booking has been cancelled.",
      summary: [
        { label: "Listing", value: title },
        { label: "Date & time", value: when },
      ],
      paragraphs: [refundLine],
      cta: { label: "Browse more spaces", href: `${APP_URL}/explore` },
    },
  })
}

export async function sendHostCancellationNotice(
  booking: BookingEmailPayload,
  _refundAmount: number,
  _penalty?: HostPenaltyEmailPayload,
  _cancelledBy: "guest" | "host" = "guest"
) {
  void _cancelledBy
  if (!booking.host_email) return { sent: false, error: "Missing host email" }
  const title = booking.listing_title ?? "Thrml session"
  const when = formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)

  return sendThrmlLayoutEmail({
    to: booking.host_email,
    subject: `Booking cancelled by guest — ${formatLongDate(booking.session_date)}`,
    userId: booking.host_id ?? null,
    preferenceKey: "booking_cancelled",
    layout: {
      preview: `Guest cancelled — ${title}`,
      kicker: "Booking cancelled",
      title: "A guest has cancelled their booking.",
      summary: [
        { label: "Guest", value: booking.guest_name ?? "Guest" },
        { label: "Listing", value: title },
        { label: "Date & time", value: when },
      ],
      paragraphs: ["Your calendar has been updated and this slot is now available again."],
      cta: { label: "View your calendar", href: `${APP_URL}/dashboard/calendar` },
    },
  })
}

export async function sendGuestHostCancelledNotice(
  booking: BookingEmailPayload,
  refundAmount: number
) {
  if (!booking.guest_email) return { sent: false, error: "Missing guest email" }
  const title = booking.listing_title ?? "Thrml session"
  const when = formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)

  return sendThrmlLayoutEmail({
    to: booking.guest_email,
    subject: "Your booking has been cancelled by the host",
    userId: booking.guest_id ?? null,
    preferenceKey: "booking_cancelled",
    layout: {
      preview: "Your host cancelled this booking",
      kicker: "Booking cancelled",
      title: "We're sorry — your host has cancelled this booking.",
      summary: [
        { label: "Listing", value: title },
        { label: "Date & time", value: when },
      ],
      paragraphs: [
        `You will receive a full refund of ${formatUsd(refundAmount)} including the platform fee within 5-10 business days.`,
      ],
      cta: { label: "Find another space", href: `${APP_URL}/explore` },
      footnote: "If you have concerns about this cancellation, contact us at hello@usethrml.com.",
    },
  })
}

export async function sendHostCancellationConfirmation(booking: BookingEmailPayload) {
  if (!booking.host_email) return { sent: false, error: "Missing host email" }
  const title = booking.listing_title ?? "Thrml session"
  const when = formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)

  return sendThrmlLayoutEmail({
    to: booking.host_email,
    subject: `Booking cancellation confirmed — ${booking.guest_name ?? "Guest"}`,
    userId: booking.host_id ?? null,
    preferenceKey: "booking_cancelled",
    layout: {
      preview: "Your cancellation is confirmed",
      kicker: "Cancellation confirmed",
      title: "Your cancellation has been processed.",
      summary: [
        { label: "Guest", value: booking.guest_name ?? "Guest" },
        { label: "Listing", value: title },
        { label: "Date & time", value: when },
      ],
      paragraphs: ["The guest has been notified and will receive a full refund."],
      cta: { label: "View your listings", href: `${APP_URL}/dashboard/listings` },
    },
  })
}

export async function sendHostNewBookingAlert(booking: BookingConfirmedEmailPayload) {
  if (!booking.host_email) return { sent: false, error: "Missing host email" }
  const when = formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)

  return sendThrmlLayoutEmail({
    to: booking.host_email,
    subject: `New booking — ${booking.guest_name ?? "Guest"} on ${formatLongDate(booking.session_date)}`,
    userId: booking.host_id ?? null,
    preferenceKey: "new_booking",
    layout: {
      preview: `New booking — ${booking.guest_name ?? "Guest"}`,
      kicker: "New booking",
      title: "You have a new booking.",
      summary: [
        { label: "Guest", value: booking.guest_name ?? "Guest" },
        { label: "Date & time", value: when },
        { label: "Your payout", value: formatUsd(booking.host_payout ?? 0) },
      ],
      paragraphs: [
        "Access details will be sent to your guest automatically 2 hours before their session. No action needed.",
      ],
      cta: { label: "View booking", href: `${APP_URL}/dashboard/bookings/${booking.booking_id}` },
    },
  })
}

export async function sendHostBookingConfirmedEmail(booking: BookingConfirmedEmailPayload) {
  return sendHostNewBookingAlert(booking)
}

export async function sendGuestBookingConfirmation(booking: BookingConfirmedEmailPayload) {
  if (!booking.guest_email) return { sent: false, error: "Missing guest email" }
  const title = booking.listing_title ?? "Your session"
  const accessType = normalizeAccessType(booking.listing_access_type)
  const accessPreview =
    accessType === "host_onsite"
      ? "Your host will meet you on arrival."
      : "Your access code will be sent 2 hours before your session."
  const locationLabel =
    booking.listing_location_label?.trim() || "Address available in your booking details"
  const when = formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)

  return sendThrmlLayoutEmail({
    to: booking.guest_email,
    subject: `You're booked — ${title}`,
    userId: booking.guest_id ?? null,
    preferenceKey: "new_booking",
    layout: {
      preview: `You're booked — ${title}`,
      kicker: "Booking confirmed",
      title: "Your booking is confirmed.",
      summary: [
        { label: "Listing", value: `${serviceEmoji(booking.service_type)} ${title}` },
        { label: "Address", value: locationLabel },
        { label: "Date & time", value: when },
        { label: "Host", value: booking.host_name ?? "Host" },
        { label: "Total paid", value: formatUsd(booking.total_charged ?? 0) },
      ],
      paragraphs: [accessPreview, policyReminder(booking.listing_cancellation_policy)],
      cta: { label: "View booking details", href: `${APP_URL}/dashboard/bookings/${booking.booking_id}` },
      footnote:
        "If you need to cancel or have questions, visit your dashboard or contact us at hello@usethrml.com.",
    },
  })
}

export async function sendGuestBookingConfirmedEmail(booking: BookingConfirmedEmailPayload) {
  return sendGuestBookingConfirmation(booking)
}

export async function sendHostNewReviewEmail(args: {
  hostId: string | null
  hostEmail: string | null
  hostFirstName: string | null
  guestFirstName: string | null
  listingTitle: string
  listingId: string
  ratingOverall: number
  comment: string | null
  ratingCleanliness: number | null
  ratingAccuracy: number | null
  ratingCommunication: number | null
  ratingValue: number | null
}) {
  if (!args.hostEmail) return { sent: false, error: "Missing host email" }
  const stars = "★".repeat(Math.max(1, Math.min(5, Math.round(args.ratingOverall))))
  const summary: SummaryRow[] = [
    { label: "Listing", value: args.listingTitle },
    { label: "Rating", value: `${stars} (${Math.round(args.ratingOverall)}/5)` },
  ]
  if (args.comment) summary.push({ label: "Review", value: args.comment })

  return sendThrmlLayoutEmail({
    to: args.hostEmail,
    subject: `New review for ${args.listingTitle}`,
    userId: args.hostId ?? null,
    preferenceKey: "new_review",
    layout: {
      preview: `New review for ${args.listingTitle}`,
      kicker: "New review",
      title: `${args.guestFirstName ?? "A guest"} left you a review.`,
      summary,
      cta: { label: "View review", href: `${APP_URL}/dashboard/listings/${args.listingId}#reviews` },
    },
  })
}

export async function sendHostNewReviewNotification(args: {
  hostId: string | null
  hostEmail: string | null
  guestFirstName: string | null
  listingTitle: string
  listingId: string
  ratingOverall: number
  comment: string | null
}) {
  return sendHostNewReviewEmail({
    hostId: args.hostId,
    hostEmail: args.hostEmail,
    hostFirstName: null,
    guestFirstName: args.guestFirstName,
    listingTitle: args.listingTitle,
    listingId: args.listingId,
    ratingOverall: args.ratingOverall,
    comment: args.comment,
    ratingCleanliness: null,
    ratingAccuracy: null,
    ratingCommunication: null,
    ratingValue: null,
  })
}

export async function sendHostPayoutSentEmail(args: {
  hostId: string | null
  hostEmail: string | null
  hostFirstName: string | null
  listingTitle: string
  sessionDate: string | null
  guestFullName: string | null
  hostPayout: number
}) {
  if (!args.hostEmail) return { sent: false, error: "Missing host email" }

  return sendThrmlLayoutEmail({
    to: args.hostEmail,
    subject: `Session complete — payout processing for ${args.listingTitle}`,
    userId: args.hostId ?? null,
    preferenceKey: "payout_sent",
    layout: {
      preview: `Payout processing — ${args.listingTitle}`,
      kicker: "Session complete",
      title: `Your session with ${args.guestFullName ?? "a guest"} is complete.`,
      summary: [
        { label: "Listing", value: args.listingTitle },
        { label: "Session date", value: formatLongDate(args.sessionDate) },
        { label: "Payout", value: formatUsd(args.hostPayout) },
      ],
      paragraphs: [
        `Your payout of ${formatUsd(args.hostPayout)} is being processed by Stripe and should arrive within 2 business days.`,
        "Check your payout status at any time in your Stripe Express dashboard.",
      ],
      cta: { label: "View payout status", href: `${APP_URL}/dashboard/payouts` },
    },
  })
}

export async function sendHostPayoutNotice(args: {
  hostId: string | null
  hostEmail: string | null
  hostFirstName: string | null
  listingTitle: string
  sessionDate: string | null
  guestFullName: string | null
  hostPayout: number
}) {
  return sendHostPayoutSentEmail(args)
}

export async function sendPreArrivalReminderEmail(args: {
  guestId: string | null
  guestEmail: string | null
  guestFirstName: string | null
  hostFirstName: string | null
  listingTitle: string
  sessionDate: string | null
  startTime: string | null
  endTime: string | null
  accessType: string | null
  accessCode: string | null
  entryInstructions: string | null
  bookingId: string
}) {
  if (!args.guestEmail) return { sent: false, error: "Missing guest email" }
  const accessType = normalizeAccessType(args.accessType)
  const accessLine =
    accessType === "host_onsite"
      ? "Your host will meet you on arrival."
      : "Your access code will arrive 2 hours before your session."
  const when = formatBookingWindow(args.sessionDate, args.startTime, args.endTime)

  return sendThrmlLayoutEmail({
    to: args.guestEmail,
    subject: `Your session tomorrow — ${args.listingTitle}`,
    userId: args.guestId ?? null,
    preferenceKey: "new_booking",
    layout: {
      preview: `Your session tomorrow — ${args.listingTitle}`,
      kicker: "Reminder",
      title: "Your session is tomorrow.",
      summary: [
        { label: "Listing", value: args.listingTitle },
        { label: "Date & time", value: when },
      ],
      paragraphs: [accessLine],
      cta: { label: "View booking details", href: `${APP_URL}/dashboard/bookings/${args.bookingId}` },
    },
  })
}

export async function sendGuest24HourReminder(args: {
  guestId: string | null
  guestEmail: string | null
  listingTitle: string
  sessionDate: string | null
  startTime: string | null
  endTime: string | null
  accessType: string | null
  bookingId: string
}) {
  return sendPreArrivalReminderEmail({
    guestId: args.guestId,
    guestEmail: args.guestEmail,
    guestFirstName: null,
    hostFirstName: null,
    listingTitle: args.listingTitle,
    sessionDate: args.sessionDate,
    startTime: args.startTime,
    endTime: args.endTime,
    accessType: args.accessType,
    accessCode: null,
    entryInstructions: null,
    bookingId: args.bookingId,
  })
}

export async function sendHost24HourReminder(args: {
  hostId: string | null
  hostEmail: string | null
  guestName: string | null
  listingTitle: string
  startTime: string | null
  endTime: string | null
  sessionDate: string | null
  accessType: string | null
  bookingId: string
}) {
  if (!args.hostEmail) return { sent: false, error: "Missing host email" }
  const accessType = normalizeAccessType(args.accessType)
  const startLabel = formatBookingWindow(args.sessionDate, args.startTime, args.endTime)
  const twoHoursBeforeLabel =
    args.sessionDate && args.startTime
      ? new Date(new Date(`${args.sessionDate}T${args.startTime}`).getTime() - 2 * 60 * 60 * 1000).toLocaleTimeString(
          "en-US",
          { hour: "numeric", minute: "2-digit", timeZoneName: "short" }
        )
      : "2 hours before start"
  const accessLine =
    accessType === "host_onsite"
      ? `You're listed as on-site — please be ready to greet your guest at ${startLabel}.`
      : `Access code will be sent to your guest automatically at ${twoHoursBeforeLabel}. No action needed.`

  return sendThrmlLayoutEmail({
    to: args.hostEmail,
    subject: `Guest arriving tomorrow — ${args.listingTitle}`,
    userId: args.hostId ?? null,
    preferenceKey: "new_booking",
    layout: {
      preview: `Guest arriving tomorrow — ${args.listingTitle}`,
      kicker: "Reminder",
      title: "You have a guest arriving tomorrow.",
      summary: [
        { label: "Guest", value: args.guestName ?? "Guest" },
        { label: "Listing", value: args.listingTitle },
        { label: "Date & time", value: startLabel },
      ],
      paragraphs: [accessLine],
      cta: { label: "View booking", href: `${APP_URL}/dashboard/bookings/${args.bookingId}` },
    },
  })
}

export async function sendHostTwoHourReminder(args: {
  hostId: string | null
  hostEmail: string | null
  guestName: string | null
  listingTitle: string
  sessionDate: string | null
  startTime: string | null
  endTime: string | null
  accessType: string | null
  bookingId: string
}) {
  if (!args.hostEmail) return { sent: false, error: "Missing host email" }
  const accessType = normalizeAccessType(args.accessType)
  const when = formatBookingWindow(args.sessionDate, args.startTime, args.endTime)
  const line =
    accessType === "host_onsite"
      ? `You're listed as on-site — please be ready to greet your guest at ${when}.`
      : "Access details are being sent to your guest automatically now. No action needed."

  return sendThrmlLayoutEmail({
    to: args.hostEmail,
    subject: `Host reminder — session starts soon at ${args.listingTitle}`,
    userId: args.hostId ?? null,
    preferenceKey: "new_booking",
    layout: {
      preview: `Session starts soon — ${args.listingTitle}`,
      kicker: "Reminder",
      title: "Your guest is arriving soon.",
      summary: [
        { label: "Guest", value: args.guestName ?? "Guest" },
        { label: "Listing", value: args.listingTitle },
        { label: "Date & time", value: when },
      ],
      paragraphs: [line],
      cta: { label: "View booking", href: `${APP_URL}/dashboard/bookings/${args.bookingId}` },
    },
  })
}

export async function sendPostSessionReviewRequestEmail(args: {
  guestId: string | null
  guestEmail: string | null
  guestFirstName: string | null
  listingTitle: string
  bookingId: string
}) {
  if (!args.guestEmail) return { sent: false, error: "Missing guest email" }

  return sendThrmlLayoutEmail({
    to: args.guestEmail,
    subject: `How was your session at ${args.listingTitle}?`,
    userId: args.guestId ?? null,
    preferenceKey: "new_booking",
    layout: {
      preview: `How was your session at ${args.listingTitle}?`,
      kicker: "Review request",
      title: "Hope your session was exactly what you needed.",
      summary: [
        { label: "Listing", value: args.listingTitle },
        { label: "Rate your session", value: "⭐ ⭐ ⭐ ⭐ ⭐" },
      ],
      paragraphs: [
        "Reviews help other guests discover great spaces and help hosts improve. Takes 30 seconds.",
      ],
      cta: { label: "Leave a review", href: `${APP_URL}/dashboard/bookings/${args.bookingId}/review` },
    },
  })
}

export async function sendGuestReviewRequest(args: {
  guestId: string | null
  guestEmail: string | null
  guestFirstName: string | null
  listingTitle: string
  bookingId: string
}) {
  return sendPostSessionReviewRequestEmail(args)
}

export async function sendHostGuestReviewRequestEmail(args: {
  hostId: string | null
  hostEmail: string | null
  hostFirstName: string | null
  guestFullName: string | null
  listingTitle: string
  bookingId: string
}) {
  if (!args.hostEmail) return { sent: false, error: "Missing host email" }
  const guestLabel = (args.guestFullName ?? "your guest").trim() || "your guest"
  const guestFirstName = guestLabel.split(" ")[0] ?? "your guest"

  return sendThrmlLayoutEmail({
    to: args.hostEmail,
    subject: `Rate ${guestFirstName} — how was your guest?`,
    userId: args.hostId ?? null,
    preferenceKey: "new_review",
    layout: {
      preview: `Rate ${guestFirstName} after their session`,
      kicker: "Guest rating",
      title: `How was ${guestFirstName} as a guest?`,
      summary: [
        { label: "Guest", value: guestLabel },
        { label: "Listing", value: args.listingTitle },
        { label: "Your rating", value: "⭐ ⭐ ⭐ ⭐ ⭐" },
      ],
      paragraphs: [
        "Quick star ratings help other hosts know what to expect. Optional notes are only visible to hosts.",
      ],
      cta: { label: "Rate your guest", href: `${APP_URL}/review-guest/${args.bookingId}` },
    },
  })
}

export async function sendHostBookingRequestEmail(booking: BookingRequestEmailPayload) {
  if (!booking.host_email) return { sent: false, error: "Missing host email" }
  const title = booking.listing_title ?? "Your listing"
  const dateLabel = formatLongDate(booking.session_date)
  const timeLabel = formatTimeRange(booking.session_date, booking.start_time, booking.end_time)
  const deadlineLabel = formatDateTime(booking.confirmation_deadline)
  const bookingUrl = `${APP_URL}/dashboard/listings?highlight=${booking.booking_id}`
  const subject = `New booking request — ${title}`

  return sendThrmlLayoutEmail({
    to: booking.host_email,
    subject,
    userId: booking.host_id ?? null,
    preferenceKey: "new_booking",
    layout: {
      preview: subject,
      kicker: "Booking request",
      title: "You have a new booking request.",
      greeting: `Hi ${firstName(booking.host_name)},`,
      summary: [
        { label: "Listing", value: title },
        { label: "Guest", value: booking.guest_name ?? "Guest" },
        { label: "Date", value: dateLabel },
        { label: "Time", value: timeLabel },
        { label: "Guests", value: String(Number(booking.guest_count ?? 1)) },
        { label: "You'd receive", value: formatMoney(Number(booking.host_payout ?? 0)) },
      ],
      paragraphs: [
        `You have 24 hours to respond. Requests not confirmed by ${deadlineLabel} will be automatically cancelled.`,
      ],
      cta: { label: "Confirm booking", href: bookingUrl },
    },
  })
}

export async function sendHostBookingRequestReminderEmail(
  booking: BookingRequestEmailPayload & { urgency: "24h" | "12h" | "2h" }
) {
  if (!booking.host_email) return { sent: false, error: "Missing host email" }
  const title = booking.listing_title ?? "Your listing"
  const dateLabel = formatLongDate(booking.session_date)
  const timeLabel = formatTimeRange(booking.session_date, booking.start_time, booking.end_time)
  const deadlineLabel = formatDateTime(booking.confirmation_deadline)
  const bookingUrl = `${APP_URL}/dashboard/listings?highlight=${booking.booking_id}`
  const urgencyLine =
    booking.urgency === "2h"
      ? "Urgent: this request expires in about 2 hours."
      : booking.urgency === "12h"
        ? "Reminder: this request still needs your confirmation."
        : "Reminder: this booking request is awaiting your confirmation and expires within 24 hours."
  const subjectPrefix =
    booking.urgency === "2h" ? "Urgent reminder" : booking.urgency === "12h" ? "Reminder" : "24-hour reminder"
  const subject = `${subjectPrefix} — confirm booking request for ${title}`

  return sendThrmlLayoutEmail({
    to: booking.host_email,
    subject,
    userId: booking.host_id ?? null,
    preferenceKey: "new_booking",
    layout: {
      preview: subject,
      kicker: "Booking request",
      title: urgencyLine,
      greeting: `Hi ${firstName(booking.host_name)},`,
      summary: [
        { label: "Listing", value: title },
        { label: "Guest", value: booking.guest_name ?? "Guest" },
        { label: "Date", value: dateLabel },
        { label: "Time", value: timeLabel },
        { label: "Guests", value: String(Number(booking.guest_count ?? 1)) },
        { label: "You'd receive", value: formatMoney(Number(booking.host_payout ?? 0)) },
      ],
      paragraphs: [`Respond by ${deadlineLabel} to confirm and keep this booking.`],
      cta: { label: "Confirm booking", href: bookingUrl },
    },
  })
}

export async function sendGuestBookingRequestReceivedEmail(booking: BookingRequestEmailPayload) {
  if (!booking.guest_email) return { sent: false, error: "Missing guest email" }
  const title = booking.listing_title ?? "Your session"
  const dateLabel = formatLongDate(booking.session_date)
  const timeLabel = formatTimeRange(booking.session_date, booking.start_time, booking.end_time)
  const deadlineLabel = formatDateTime(booking.confirmation_deadline)
  const bookingUrl = `${APP_URL}/dashboard/bookings/${booking.booking_id}`
  const subject = `Booking request sent — ${title}`

  return sendThrmlLayoutEmail({
    to: booking.guest_email,
    subject,
    userId: booking.guest_id ?? null,
    preferenceKey: "new_booking",
    layout: {
      preview: subject,
      kicker: "Request sent",
      title: "Your booking request has been sent.",
      greeting: `Hi ${firstName(booking.guest_name)},`,
      summary: [
        { label: "Listing", value: title },
        { label: "Host", value: firstName(booking.host_name, "your host") },
        { label: "Date", value: dateLabel },
        { label: "Time", value: timeLabel },
        { label: "Guests", value: String(Number(booking.guest_count ?? 1)) },
        { label: "Total", value: formatMoney(Number(booking.total_charged ?? 0)) },
      ],
      paragraphs: [
        "Your card has been authorized but will not be charged until the host confirms.",
        `Expected response by: ${deadlineLabel}`,
      ],
      cta: { label: "View request", href: bookingUrl },
    },
  })
}

export async function sendGuestBookingRequestDeclinedEmail(booking: BookingRequestEmailPayload) {
  if (!booking.guest_email) return { sent: false, error: "Missing guest email" }
  const title = booking.listing_title ?? "your session"
  const dateLabel = formatLongDate(booking.session_date)
  const exploreUrl = `${APP_URL}/explore?service_type=${encodeURIComponent(booking.service_type ?? "sauna")}`
  const subject = `Booking request declined — ${title}`

  return sendThrmlLayoutEmail({
    to: booking.guest_email,
    subject,
    userId: booking.guest_id ?? null,
    preferenceKey: "booking_cancelled",
    layout: {
      preview: subject,
      kicker: "Request declined",
      title: "Your booking request was declined.",
      greeting: `Hi ${firstName(booking.guest_name)},`,
      paragraphs: [
        `Unfortunately ${firstName(booking.host_name, "your host")} was unable to confirm your booking request for ${title} on ${dateLabel}.`,
        ...(booking.host_decline_reason ? [`Reason: ${booking.host_decline_reason}`] : []),
        "Your card has not been charged and any authorization hold will be released within 5-7 business days depending on your bank.",
      ],
      cta: { label: "Browse similar spaces", href: exploreUrl },
    },
  })
}

export async function sendGuestBookingRequestExpiredEmail(booking: BookingRequestEmailPayload) {
  if (!booking.guest_email) return { sent: false, error: "Missing guest email" }
  const title = booking.listing_title ?? "your session"
  const dateLabel = formatLongDate(booking.session_date)
  const exploreUrl = `${APP_URL}/explore?service_type=${encodeURIComponent(booking.service_type ?? "sauna")}`
  const subject = `Booking request expired — ${title}`

  return sendThrmlLayoutEmail({
    to: booking.guest_email,
    subject,
    userId: booking.guest_id ?? null,
    preferenceKey: "booking_cancelled",
    layout: {
      preview: subject,
      kicker: "Request expired",
      title: "Your booking request expired.",
      greeting: `Hi ${firstName(booking.guest_name)},`,
      paragraphs: [
        `Your booking request for ${title} on ${dateLabel} expired before the host responded.`,
        "Your card has not been charged.",
      ],
      cta: { label: "Browse other spaces", href: exploreUrl },
    },
  })
}

export async function sendGuestBookingPaymentCaptureFailedEmail(booking: BookingRequestEmailPayload) {
  if (!booking.guest_email) return { sent: false, error: "Missing guest email" }
  const title = booking.listing_title ?? "your session"
  const dateLabel = formatLongDate(booking.session_date)
  const subject = `Payment authorization expired — ${title}`

  return sendThrmlLayoutEmail({
    to: booking.guest_email,
    subject,
    userId: booking.guest_id ?? null,
    preferenceKey: "booking_cancelled",
    layout: {
      preview: subject,
      kicker: "Payment issue",
      title: "We couldn't complete your booking.",
      greeting: `Hi ${firstName(booking.guest_name)},`,
      paragraphs: [
        `Your booking for ${title} on ${dateLabel} could not be completed because payment authorization could not be captured.`,
        "No charge was made. Please book again with a valid payment method.",
      ],
      cta: { label: "Book again", href: `${APP_URL}/listings/${booking.listing_id ?? ""}` },
    },
  })
}

function summaryFromLines(lines: string[]): SummaryRow[] {
  const rows: SummaryRow[] = []
  for (const line of lines) {
    const colon = line.indexOf(": ")
    if (colon > 0) {
      rows.push({ label: line.slice(0, colon), value: line.slice(colon + 2) })
    } else {
      rows.push({ label: "Note", value: line })
    }
  }
  return rows
}

async function sendSessionReminderEmail(params: {
  to: string
  subject: string
  userId: string | null
  preview: string
  greeting: string
  listingTitle: string
  lines: string[]
  ctaLabel: string
  ctaUrl: string
}) {
  return sendThrmlLayoutEmail({
    to: params.to,
    subject: params.subject,
    userId: params.userId,
    preferenceKey: "new_booking",
    layout: {
      preview: params.preview,
      kicker: "Session reminder",
      title: params.listingTitle,
      greeting: params.greeting,
      summary: summaryFromLines(params.lines),
      cta: { label: params.ctaLabel, href: params.ctaUrl },
    },
  })
}

export async function sendHostOnsiteReminder(args: {
  hostId: string
  hostEmail: string | null
  hostName: string | null
  bookingId: string
  listingTitle: string
  guestName: string | null
  startTimeLabel: string
  accessInstructions: string | null
}) {
  if (!args.hostEmail) return { sent: false, error: "Missing host email" }
  const subject = `Reminder - guest arriving in 2 hours at ${args.listingTitle}`
  return sendSessionReminderEmail({
    to: args.hostEmail,
    subject,
    userId: args.hostId,
    preview: subject,
    greeting: `Hi ${firstName(args.hostName, "there")},`,
    listingTitle: args.listingTitle,
    lines: [
      `${args.guestName ?? "Your guest"} is arriving in about 2 hours.`,
      `Session time: ${args.startTimeLabel}`,
      args.accessInstructions
        ? `Guest arrival notes: ${args.accessInstructions}`
        : "Be ready to greet your guest on arrival.",
    ],
    ctaLabel: "Open host booking",
    ctaUrl: `${APP_URL}/dashboard/listings?highlight=${args.bookingId}`,
  })
}

export async function sendGuestOnsiteReminder(args: {
  guestId: string | null
  to: string | null
  guestName: string | null
  listingTitle: string
  address: string
  accessInstructions: string | null
  onsiteContactName: string | null
  onsiteContactPhone: string | null
  startTimeLabel: string
  endTimeLabel: string
  bookingId: string
}) {
  if (!args.to) return { sent: false, error: "Missing guest email" }
  const subject = `Your session at ${args.listingTitle} is in 2 hours`
  const contactLine =
    args.onsiteContactName && args.onsiteContactPhone
      ? `Need help finding the space? Reach ${args.onsiteContactName} at ${args.onsiteContactPhone}.`
      : null
  return sendSessionReminderEmail({
    to: args.to,
    subject,
    userId: args.guestId ?? null,
    preview: subject,
    greeting: `Hi ${firstName(args.guestName)},`,
    listingTitle: args.listingTitle,
    lines: [
      `Address: ${args.address}`,
      `Session time: ${args.startTimeLabel} - ${args.endTimeLabel}`,
      "Your host will meet you on arrival.",
      ...(args.accessInstructions ? [`Entry notes: ${args.accessInstructions}`] : []),
      ...(contactLine ? [contactLine] : []),
    ],
    ctaLabel: "View booking details",
    ctaUrl: `${APP_URL}/dashboard/bookings/${args.bookingId}`,
  })
}

export async function sendGuestEntryInstructionsEmail(args: {
  guestId: string | null
  to: string | null
  guestName: string | null
  listingTitle: string
  address: string
  accessInstructions: string
  startTimeLabel: string
  endTimeLabel: string
  bookingId: string
}) {
  if (!args.to) return { sent: false, error: "Missing guest email" }
  const subject = `Your session at ${args.listingTitle} is in 2 hours`
  return sendSessionReminderEmail({
    to: args.to,
    subject,
    userId: args.guestId ?? null,
    preview: subject,
    greeting: `Hi ${firstName(args.guestName)},`,
    listingTitle: args.listingTitle,
    lines: [
      `Address: ${args.address}`,
      `Session time: ${args.startTimeLabel} - ${args.endTimeLabel}`,
      `Entry instructions: ${args.accessInstructions}`,
    ],
    ctaLabel: "View booking details",
    ctaUrl: `${APP_URL}/dashboard/bookings/${args.bookingId}`,
  })
}

export { sendCreditGrantedEmail } from "@/lib/emails/credit-granted"
