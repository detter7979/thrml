import { formatMoney } from "@/lib/cancellations"
import { sendEmail } from "@/lib/emails/send"
import {
  bookingSummaryCard,
  ctaButton,
  formatBookingTime,
  thrmlEmailWrapper,
} from "@/lib/emails/send"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
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
  const html = thrmlEmailWrapper(`
    <h1 style="color:#ffffff;font-size:30px;line-height:1.2;margin:0 0 14px;">Your booking has been cancelled.</h1>
    ${bookingSummaryCard([
      { label: "Listing", value: escapeHtml(title) },
      { label: "Date & time", value: escapeHtml(formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)) },
    ])}
    <p style="color:#d6d6d6;line-height:1.65;margin:0 0 16px;">${escapeHtml(refundLine)}</p>
    ${ctaButton("Browse more spaces →", `${APP_URL}/explore`)}
  `)
  const text = [
    "Your booking has been cancelled.",
    `Listing: ${title}`,
    `Date & time: ${formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)}`,
    refundLine,
    `Browse more spaces: ${APP_URL}/explore`,
  ].join("\n")
  return sendEmail({
    to: booking.guest_email,
    subject: `Booking cancelled — ${title}`,
    html,
    text,
    userId: booking.guest_id ?? null,
    preferenceKey: "booking_cancelled",
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
  const html = thrmlEmailWrapper(`
    <h1 style="color:#ffffff;font-size:30px;line-height:1.2;margin:0 0 14px;">A guest has cancelled their booking.</h1>
    ${bookingSummaryCard([
      { label: "Guest", value: escapeHtml(booking.guest_name ?? "Guest") },
      { label: "Listing", value: escapeHtml(title) },
      { label: "Date & time", value: escapeHtml(formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)) },
    ])}
    <p style="color:#d6d6d6;line-height:1.65;margin:0 0 16px;">Your calendar has been updated and this slot is now available again.</p>
    ${ctaButton("View your calendar →", `${APP_URL}/dashboard/calendar`)}
  `)
  const text = [
    "A guest has cancelled their booking.",
    `Guest: ${booking.guest_name ?? "Guest"}`,
    `Listing: ${title}`,
    `Date & time: ${formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)}`,
    "Your calendar has been updated and this slot is now available again.",
    `View your calendar: ${APP_URL}/dashboard/calendar`,
  ].join("\n")

  return sendEmail({
    to: booking.host_email,
    subject: `Booking cancelled by guest — ${formatLongDate(booking.session_date)}`,
    html,
    text,
    userId: booking.host_id ?? null,
    preferenceKey: "booking_cancelled",
  })
}

export async function sendGuestHostCancelledNotice(
  booking: BookingEmailPayload,
  refundAmount: number
) {
  if (!booking.guest_email) return { sent: false, error: "Missing guest email" }
  const title = booking.listing_title ?? "Thrml session"
  const html = thrmlEmailWrapper(`
    <h1 style="color:#ffffff;font-size:30px;line-height:1.2;margin:0 0 14px;">We're sorry — your host has cancelled this booking.</h1>
    ${bookingSummaryCard([
      { label: "Listing", value: escapeHtml(title) },
      { label: "Date & time", value: escapeHtml(formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)) },
    ])}
    <p style="color:#d6d6d6;line-height:1.65;margin:0 0 16px;">
      You will receive a full refund of ${escapeHtml(formatUsd(refundAmount))} including the platform fee within 5-10 business days.
    </p>
    ${ctaButton("Find another space →", `${APP_URL}/explore`)}
    <p style="color:#9f9f9f;line-height:1.6;margin:20px 0 0;">If you have concerns about this cancellation, contact us at hello@usethrml.com.</p>
  `)
  const text = [
    "We're sorry - your host has cancelled this booking.",
    `Listing: ${title}`,
    `Date & time: ${formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)}`,
    `You will receive a full refund of ${formatUsd(refundAmount)} including the platform fee within 5-10 business days.`,
    `Find another space: ${APP_URL}/explore`,
    "If you have concerns about this cancellation, contact us at hello@usethrml.com.",
  ].join("\n")
  return sendEmail({
    to: booking.guest_email,
    subject: "Your booking has been cancelled by the host",
    html,
    text,
    userId: booking.guest_id ?? null,
    preferenceKey: "booking_cancelled",
  })
}

export async function sendHostCancellationConfirmation(booking: BookingEmailPayload) {
  if (!booking.host_email) return { sent: false, error: "Missing host email" }
  const title = booking.listing_title ?? "Thrml session"
  const html = thrmlEmailWrapper(`
    <h1 style="color:#ffffff;font-size:30px;line-height:1.2;margin:0 0 14px;">Your cancellation has been processed.</h1>
    ${bookingSummaryCard([
      { label: "Guest", value: escapeHtml(booking.guest_name ?? "Guest") },
      { label: "Listing", value: escapeHtml(title) },
      { label: "Date & time", value: escapeHtml(formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)) },
    ])}
    <p style="color:#d6d6d6;line-height:1.65;margin:0 0 16px;">The guest has been notified and will receive a full refund.</p>
    ${ctaButton("View your listings →", `${APP_URL}/dashboard/listings`)}
  `)
  const text = [
    "Your cancellation has been processed.",
    `Guest: ${booking.guest_name ?? "Guest"}`,
    `Listing: ${title}`,
    `Date & time: ${formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)}`,
    "The guest has been notified and will receive a full refund.",
    `View your listings: ${APP_URL}/dashboard/listings`,
  ].join("\n")

  return sendEmail({
    to: booking.host_email,
    subject: `Booking cancellation confirmed — ${booking.guest_name ?? "Guest"}`,
    html,
    text,
    userId: booking.host_id ?? null,
    preferenceKey: "booking_cancelled",
  })
}

export async function sendHostNewBookingAlert(booking: BookingConfirmedEmailPayload) {
  if (!booking.host_email) return { sent: false, error: "Missing host email" }
  const html = thrmlEmailWrapper(`
    <h1 style="color:#ffffff;font-size:30px;line-height:1.2;margin:0 0 14px;">You have a new booking.</h1>
    ${bookingSummaryCard([
      { label: "Guest", value: escapeHtml(booking.guest_name ?? "Guest") },
      { label: "Date & time", value: escapeHtml(formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)) },
      { label: "Your payout", value: escapeHtml(formatUsd(booking.host_payout ?? 0)) },
    ])}
    <p style="color:#d6d6d6;line-height:1.65;margin:0 0 16px;">
      Access details will be sent to your guest automatically 2 hours before their session. No action needed.
    </p>
    ${ctaButton("View booking →", `${APP_URL}/dashboard/bookings/${booking.booking_id}`)}
  `)
  const text = [
    "You have a new booking.",
    `Guest: ${booking.guest_name ?? "Guest"}`,
    `Date & time: ${formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)}`,
    `Your payout: ${formatUsd(booking.host_payout ?? 0)}`,
    "Access details will be sent to your guest automatically 2 hours before their session. No action needed.",
    `View booking: ${APP_URL}/dashboard/bookings/${booking.booking_id}`,
  ].join("\n")
  return sendEmail({
    to: booking.host_email,
    subject: `New booking — ${booking.guest_name ?? "Guest"} on ${formatLongDate(booking.session_date)}`,
    html,
    text,
    userId: booking.host_id ?? null,
    preferenceKey: "new_booking",
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
  const html = thrmlEmailWrapper(`
    <h1 style="color:#ffffff;font-size:30px;line-height:1.2;margin:0 0 14px;">Your booking is confirmed.</h1>
    ${bookingSummaryCard([
      { label: "Listing", value: `${serviceEmoji(booking.service_type)} ${escapeHtml(title)}` },
      { label: "Address", value: `📍 ${escapeHtml(locationLabel)}` },
      { label: "Date & time", value: `🕐 ${escapeHtml(formatBookingWindow(booking.session_date, booking.start_time, booking.end_time))}` },
      { label: "Host", value: `👤 ${escapeHtml(booking.host_name ?? "Host")}` },
      { label: "Total paid", value: `💳 ${escapeHtml(formatUsd(booking.total_charged ?? 0))}` },
    ])}
    <p style="color:#d6d6d6;line-height:1.65;margin:0 0 10px;">${escapeHtml(accessPreview)}</p>
    <p style="color:#d6d6d6;line-height:1.65;margin:0 0 16px;">${escapeHtml(policyReminder(booking.listing_cancellation_policy))}</p>
    ${ctaButton("View booking details →", `${APP_URL}/dashboard/bookings/${booking.booking_id}`)}
    <p style="color:#9f9f9f;line-height:1.6;margin:20px 0 0;">
      If you need to cancel or have questions, visit your dashboard or contact us at hello@usethrml.com.
    </p>
  `)
  const text = [
    "Your booking is confirmed.",
    `Listing: ${title}`,
    `Address: ${locationLabel}`,
    `Date & time: ${formatBookingWindow(booking.session_date, booking.start_time, booking.end_time)}`,
    `Host: ${booking.host_name ?? "Host"}`,
    `Total paid: ${formatUsd(booking.total_charged ?? 0)}`,
    accessPreview,
    policyReminder(booking.listing_cancellation_policy),
    `View booking details: ${APP_URL}/dashboard/bookings/${booking.booking_id}`,
    "If you need to cancel or have questions, visit your dashboard or contact us at hello@usethrml.com.",
  ].join("\n")

  return sendEmail({
    to: booking.guest_email,
    subject: `You're booked — ${title}`,
    html,
    text,
    userId: booking.guest_id ?? null,
    preferenceKey: "new_booking",
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
  const safeComment = args.comment ? escapeHtml(args.comment) : null
  const html = thrmlEmailWrapper(`
    <h1 style="color:#ffffff;font-size:30px;line-height:1.2;margin:0 0 14px;">${escapeHtml(args.guestFirstName ?? "A guest")} left you a review.</h1>
    ${bookingSummaryCard([
      { label: "Listing", value: escapeHtml(args.listingTitle) },
      { label: "Rating", value: `${stars} (${Math.round(args.ratingOverall)}/5)` },
      ...(safeComment ? [{ label: "Review", value: safeComment }] : []),
    ])}
    ${ctaButton("View review →", `${APP_URL}/dashboard/listings/${args.listingId}#reviews`)}
  `)
  const text = [
    `${args.guestFirstName ?? "A guest"} left you a review.`,
    `Listing: ${args.listingTitle}`,
    `Rating: ${stars} (${Math.round(args.ratingOverall)}/5)`,
    args.comment ? `Review: ${args.comment}` : null,
    `View review: ${APP_URL}/dashboard/listings/${args.listingId}#reviews`,
  ]
    .filter(Boolean)
    .join("\n")
  return sendEmail({
    to: args.hostEmail,
    subject: `New review for ${args.listingTitle}`,
    html,
    text,
    userId: args.hostId ?? null,
    preferenceKey: "new_review",
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
  const html = thrmlEmailWrapper(`
    <h1 style="color:#ffffff;font-size:30px;line-height:1.2;margin:0 0 14px;">
      Your session with ${escapeHtml(args.guestFullName ?? "a guest")} is complete.
    </h1>
    ${bookingSummaryCard([
      { label: "Listing", value: escapeHtml(args.listingTitle) },
      { label: "Session date", value: escapeHtml(formatLongDate(args.sessionDate)) },
      { label: "Payout", value: escapeHtml(formatUsd(args.hostPayout)) },
    ])}
    <p style="color:#d6d6d6;line-height:1.65;margin:0 0 8px;">
      Your payout of ${escapeHtml(formatUsd(args.hostPayout))} is being processed by Stripe and should arrive within 2 business days.
    </p>
    <p style="color:#d6d6d6;line-height:1.65;margin:0 0 16px;">
      Check your payout status at any time in your Stripe Express dashboard.
    </p>
    ${ctaButton("View payout status →", `${APP_URL}/dashboard/payouts`)}
  `)
  const text = [
    `Your session with ${args.guestFullName ?? "a guest"} is complete.`,
    `Listing: ${args.listingTitle}`,
    `Session date: ${formatLongDate(args.sessionDate)}`,
    `Payout: ${formatUsd(args.hostPayout)}`,
    `Your payout of ${formatUsd(args.hostPayout)} is being processed by Stripe and should arrive within 2 business days.`,
    "Check your payout status at any time in your Stripe Express dashboard.",
    `View payout status: ${APP_URL}/dashboard/payouts`,
  ].join("\n")
  return sendEmail({
    to: args.hostEmail,
    subject: `Session complete — payout processing for ${args.listingTitle}`,
    html,
    text,
    userId: args.hostId ?? null,
    preferenceKey: "payout_sent",
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
  const html = thrmlEmailWrapper(`
    <h1 style="color:#ffffff;font-size:30px;line-height:1.2;margin:0 0 14px;">Your session is tomorrow.</h1>
    ${bookingSummaryCard([
      { label: "Listing", value: escapeHtml(args.listingTitle) },
      { label: "Date & time", value: escapeHtml(formatBookingWindow(args.sessionDate, args.startTime, args.endTime)) },
    ])}
    <p style="color:#d6d6d6;line-height:1.65;margin:0 0 16px;">${escapeHtml(accessLine)}</p>
    ${ctaButton("View booking details →", `${APP_URL}/dashboard/bookings/${args.bookingId}`)}
  `)
  const text = [
    "Your session is tomorrow.",
    `Listing: ${args.listingTitle}`,
    `Date & time: ${formatBookingWindow(args.sessionDate, args.startTime, args.endTime)}`,
    accessLine,
    `View booking details: ${APP_URL}/dashboard/bookings/${args.bookingId}`,
  ].join("\n")
  return sendEmail({
    to: args.guestEmail,
    subject: `Your session tomorrow — ${args.listingTitle}`,
    html,
    text,
    userId: args.guestId ?? null,
    preferenceKey: "new_booking",
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
  const html = thrmlEmailWrapper(`
    <h1 style="color:#ffffff;font-size:30px;line-height:1.2;margin:0 0 14px;">You have a guest arriving tomorrow.</h1>
    ${bookingSummaryCard([
      { label: "Guest", value: escapeHtml(args.guestName ?? "Guest") },
      { label: "Listing", value: escapeHtml(args.listingTitle) },
      { label: "Date & time", value: escapeHtml(startLabel) },
    ])}
    <p style="color:#d6d6d6;line-height:1.65;margin:0 0 16px;">${escapeHtml(accessLine)}</p>
    ${ctaButton("View booking →", `${APP_URL}/dashboard/bookings/${args.bookingId}`)}
  `)
  const text = [
    "You have a guest arriving tomorrow.",
    `Guest: ${args.guestName ?? "Guest"}`,
    `Listing: ${args.listingTitle}`,
    `Date & time: ${startLabel}`,
    accessLine,
    `View booking: ${APP_URL}/dashboard/bookings/${args.bookingId}`,
  ].join("\n")
  return sendEmail({
    to: args.hostEmail,
    subject: `Guest arriving tomorrow — ${args.listingTitle}`,
    html,
    text,
    userId: args.hostId ?? null,
    preferenceKey: "new_booking",
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
  const line =
    accessType === "host_onsite"
      ? `You're listed as on-site — please be ready to greet your guest at ${formatBookingWindow(args.sessionDate, args.startTime, args.endTime)}.`
      : "Access details are being sent to your guest automatically now. No action needed."
  const html = thrmlEmailWrapper(`
    <h1 style="color:#ffffff;font-size:30px;line-height:1.2;margin:0 0 14px;">Your guest is arriving soon.</h1>
    ${bookingSummaryCard([
      { label: "Guest", value: escapeHtml(args.guestName ?? "Guest") },
      { label: "Listing", value: escapeHtml(args.listingTitle) },
      { label: "Date & time", value: escapeHtml(formatBookingWindow(args.sessionDate, args.startTime, args.endTime)) },
    ])}
    <p style="color:#d6d6d6;line-height:1.65;margin:0 0 16px;">${escapeHtml(line)}</p>
    ${ctaButton("View booking →", `${APP_URL}/dashboard/bookings/${args.bookingId}`)}
  `)
  const text = [
    "Your guest is arriving soon.",
    `Guest: ${args.guestName ?? "Guest"}`,
    `Listing: ${args.listingTitle}`,
    `Date & time: ${formatBookingWindow(args.sessionDate, args.startTime, args.endTime)}`,
    line,
    `View booking: ${APP_URL}/dashboard/bookings/${args.bookingId}`,
  ].join("\n")
  return sendEmail({
    to: args.hostEmail,
    subject: `Host reminder — session starts soon at ${args.listingTitle}`,
    html,
    text,
    userId: args.hostId ?? null,
    preferenceKey: "new_booking",
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
  const html = thrmlEmailWrapper(`
    <h1 style="color:#ffffff;font-size:30px;line-height:1.2;margin:0 0 14px;">Hope your session was exactly what you needed.</h1>
    <p style="color:#d6d6d6;line-height:1.65;margin:0 0 16px;">
      Reviews help other guests discover great spaces and help hosts improve. Takes 30 seconds.
    </p>
    ${bookingSummaryCard([
      { label: "Listing", value: escapeHtml(args.listingTitle) },
      { label: "Rate your session", value: "⭐ ⭐ ⭐ ⭐ ⭐" },
    ])}
    ${ctaButton("Leave a review →", `${APP_URL}/dashboard/bookings/${args.bookingId}/review`)}
  `)
  const text = [
    `How was your session at ${args.listingTitle}?`,
    "Hope your session was exactly what you needed.",
    "Reviews help other guests discover great spaces and help hosts improve. Takes 30 seconds.",
    `Leave a review: ${APP_URL}/dashboard/bookings/${args.bookingId}/review`,
  ].join("\n")
  return sendEmail({
    to: args.guestEmail,
    subject: `How was your session at ${args.listingTitle}?`,
    html,
    text,
    userId: args.guestId ?? null,
    preferenceKey: "new_booking",
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

export async function sendHostBookingRequestEmail(booking: BookingRequestEmailPayload) {
  if (!booking.host_email) return { sent: false, error: "Missing host email" }
  const title = booking.listing_title ?? "Your listing"
  const dateLabel = formatLongDate(booking.session_date)
  const timeLabel = formatTimeRange(booking.session_date, booking.start_time, booking.end_time)
  const deadlineLabel = formatDateTime(booking.confirmation_deadline)
  const bookingUrl = `${APP_URL}/dashboard/listings?highlight=${booking.booking_id}`
  const subject = `New booking request — ${title}`

  const html = `
    <p>Hi ${firstName(booking.host_name)},</p>
    <p>You have a new booking request.</p>
    <p>
      <strong>${title}</strong><br/>
      Guest: ${booking.guest_name ?? "Guest"}<br/>
      Date: ${dateLabel}<br/>
      Time: ${timeLabel}<br/>
      Guests: ${Number(booking.guest_count ?? 1)}<br/>
      You'd receive: ${formatMoney(Number(booking.host_payout ?? 0))}
    </p>
    <p>⏱ You have 24 hours to respond. Requests not confirmed by ${deadlineLabel} will be automatically cancelled.</p>
    <p><a href="${bookingUrl}">Confirm booking →</a></p>
    <p><a href="${bookingUrl}">View request →</a></p>
  `
  const text = [
    `Hi ${firstName(booking.host_name)},`,
    "",
    "You have a new booking request.",
    `${title}`,
    `Guest: ${booking.guest_name ?? "Guest"}`,
    `Date: ${dateLabel}`,
    `Time: ${timeLabel}`,
    `Guests: ${Number(booking.guest_count ?? 1)}`,
    `You'd receive: ${formatMoney(Number(booking.host_payout ?? 0))}`,
    `Respond by: ${deadlineLabel}`,
    `Confirm booking: ${bookingUrl}`,
    `View request: ${bookingUrl}`,
  ].join("\n")

  return sendEmail({
    to: booking.host_email,
    subject,
    html,
    text,
    userId: booking.host_id ?? null,
    preferenceKey: "new_booking",
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

  const html = `
    <p>Hi ${firstName(booking.guest_name)},</p>
    <p>Your booking request has been sent to ${firstName(booking.host_name, "your host")}.</p>
    <p>
      <strong>${title}</strong><br/>
      Date: ${dateLabel}<br/>
      Time: ${timeLabel}<br/>
      Guests: ${Number(booking.guest_count ?? 1)}<br/>
      Total: ${formatMoney(Number(booking.total_charged ?? 0))}
    </p>
    <p>Your card has been authorized but will not be charged until the host confirms.</p>
    <p>Expected response by: ${deadlineLabel}</p>
    <p><a href="${bookingUrl}">View request →</a></p>
  `
  const text = [
    `Hi ${firstName(booking.guest_name)},`,
    "",
    `Your booking request has been sent to ${firstName(booking.host_name, "your host")}.`,
    `${title}`,
    `Date: ${dateLabel}`,
    `Time: ${timeLabel}`,
    `Guests: ${Number(booking.guest_count ?? 1)}`,
    `Total: ${formatMoney(Number(booking.total_charged ?? 0))}`,
    "Your card has been authorized but will not be charged until the host confirms.",
    `Expected response by: ${deadlineLabel}`,
    `View request: ${bookingUrl}`,
  ].join("\n")

  return sendEmail({
    to: booking.guest_email,
    subject,
    html,
    text,
    userId: booking.guest_id ?? null,
    preferenceKey: "new_booking",
  })
}

export async function sendGuestBookingRequestDeclinedEmail(booking: BookingRequestEmailPayload) {
  if (!booking.guest_email) return { sent: false, error: "Missing guest email" }
  const title = booking.listing_title ?? "your session"
  const dateLabel = formatLongDate(booking.session_date)
  const exploreUrl = `${APP_URL}/explore?service_type=${encodeURIComponent(booking.service_type ?? "sauna")}`
  const reasonLine = booking.host_decline_reason ? `<p>Reason: ${booking.host_decline_reason}</p>` : ""
  const textReason = booking.host_decline_reason ? `Reason: ${booking.host_decline_reason}` : null
  const subject = `Booking request declined — ${title}`
  const html = `
    <p>Hi ${firstName(booking.guest_name)},</p>
    <p>Unfortunately ${firstName(booking.host_name, "your host")} was unable to confirm your booking request for ${title} on ${dateLabel}.</p>
    ${reasonLine}
    <p>Your card has not been charged and any authorization hold will be released within 5-7 business days depending on your bank.</p>
    <p><a href="${exploreUrl}">Browse similar spaces →</a></p>
  `
  const text = [
    `Hi ${firstName(booking.guest_name)},`,
    "",
    `Unfortunately ${firstName(booking.host_name, "your host")} was unable to confirm your booking request for ${title} on ${dateLabel}.`,
    textReason,
    "Your card has not been charged and any authorization hold will be released within 5-7 business days depending on your bank.",
    `Browse similar spaces: ${exploreUrl}`,
  ]
    .filter(Boolean)
    .join("\n")

  return sendEmail({
    to: booking.guest_email,
    subject,
    html,
    text,
    userId: booking.guest_id ?? null,
    preferenceKey: "booking_cancelled",
  })
}

export async function sendGuestBookingRequestExpiredEmail(booking: BookingRequestEmailPayload) {
  if (!booking.guest_email) return { sent: false, error: "Missing guest email" }
  const title = booking.listing_title ?? "your session"
  const dateLabel = formatLongDate(booking.session_date)
  const exploreUrl = `${APP_URL}/explore?service_type=${encodeURIComponent(booking.service_type ?? "sauna")}`
  const subject = `Booking request expired — ${title}`
  const html = `
    <p>Hi ${firstName(booking.guest_name)},</p>
    <p>Your booking request for ${title} on ${dateLabel} expired before the host responded.</p>
    <p>Your card has not been charged.</p>
    <p><a href="${exploreUrl}">Browse other spaces →</a></p>
  `
  const text = [
    `Hi ${firstName(booking.guest_name)},`,
    "",
    `Your booking request for ${title} on ${dateLabel} expired before the host responded.`,
    "Your card has not been charged.",
    `Browse other spaces: ${exploreUrl}`,
  ].join("\n")

  return sendEmail({
    to: booking.guest_email,
    subject,
    html,
    text,
    userId: booking.guest_id ?? null,
    preferenceKey: "booking_cancelled",
  })
}

export async function sendGuestBookingPaymentCaptureFailedEmail(booking: BookingRequestEmailPayload) {
  if (!booking.guest_email) return { sent: false, error: "Missing guest email" }
  const title = booking.listing_title ?? "your session"
  const dateLabel = formatLongDate(booking.session_date)
  const subject = `Payment authorization expired — ${title}`
  const html = `
    <p>Hi ${firstName(booking.guest_name)},</p>
    <p>Your booking for ${title} on ${dateLabel} could not be completed because payment authorization could not be captured.</p>
    <p>No charge was made. Please book again with a valid payment method.</p>
    <p><a href="${APP_URL}/listings/${booking.listing_id ?? ""}">Book again →</a></p>
  `
  const text = [
    `Hi ${firstName(booking.guest_name)},`,
    "",
    `Your booking for ${title} on ${dateLabel} could not be completed because payment authorization could not be captured.`,
    "No charge was made. Please book again with a valid payment method.",
    `Book again: ${APP_URL}/listings/${booking.listing_id ?? ""}`,
  ].join("\n")

  return sendEmail({
    to: booking.guest_email,
    subject,
    html,
    text,
    userId: booking.guest_id ?? null,
    preferenceKey: "booking_cancelled",
  })
}

function buildDarkReminderEmail(params: {
  title: string
  intro: string
  lines: string[]
  ctaLabel: string
  ctaUrl: string
}) {
  const linesHtml = params.lines.map((line) => `<p style="margin:0 0 8px;">${line}</p>`).join("")
  const html = `
    <div style="margin:0;padding:28px 12px;background:#1a1a1a;">
      <div style="max-width:620px;margin:0 auto;background:#262626;border:1px solid #3a3a3a;border-radius:12px;overflow:hidden;font-family:Arial,sans-serif;color:#f7f7f7;">
        <div style="padding:18px 24px;border-bottom:1px solid #3a3a3a;">
          <div style="font-size:22px;font-weight:700;letter-spacing:0.4px;">THRML</div>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 12px;">${params.intro}</p>
          <p style="margin:0 0 12px;font-weight:700;">${params.title}</p>
          ${linesHtml}
          <p style="margin:16px 0 0;">
            <a href="${params.ctaUrl}" style="display:inline-block;background:#C4623A;color:#FFFFFF;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:700;">${params.ctaLabel}</a>
          </p>
        </div>
      </div>
    </div>
  `
  const text = [params.intro, "", params.title, ...params.lines, "", `${params.ctaLabel}: ${params.ctaUrl}`].join("\n")
  return { html, text }
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
  const email = buildDarkReminderEmail({
    intro: `Hi ${firstName(args.hostName, "there")},`,
    title: args.listingTitle,
    lines: [
      `${args.guestName ?? "Your guest"} is arriving in about 2 hours.`,
      `Session time: ${args.startTimeLabel}`,
      args.accessInstructions ? `Guest arrival notes: ${args.accessInstructions}` : "Be ready to greet your guest on arrival.",
    ].filter(Boolean) as string[],
    ctaLabel: "Open host booking",
    ctaUrl: `${APP_URL}/dashboard/listings?highlight=${args.bookingId}`,
  })
  return sendEmail({
    to: args.hostEmail,
    subject,
    html: email.html,
    text: email.text,
    userId: args.hostId,
    preferenceKey: "new_booking",
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
  const email = buildDarkReminderEmail({
    intro: `Hi ${firstName(args.guestName)},`,
    title: args.listingTitle,
    lines: [
      `Address: ${args.address}`,
      `Session time: ${args.startTimeLabel} - ${args.endTimeLabel}`,
      "Your host will meet you on arrival.",
      args.accessInstructions ? `Entry notes: ${args.accessInstructions}` : null,
      contactLine,
    ].filter(Boolean) as string[],
    ctaLabel: "View booking details",
    ctaUrl: `${APP_URL}/dashboard/bookings/${args.bookingId}`,
  })
  return sendEmail({
    to: args.to,
    subject,
    html: email.html,
    text: email.text,
    userId: args.guestId ?? null,
    preferenceKey: "new_booking",
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
  const email = buildDarkReminderEmail({
    intro: `Hi ${firstName(args.guestName)},`,
    title: args.listingTitle,
    lines: [
      `Address: ${args.address}`,
      `Session time: ${args.startTimeLabel} - ${args.endTimeLabel}`,
      `Entry instructions: ${args.accessInstructions}`,
    ],
    ctaLabel: "View booking details",
    ctaUrl: `${APP_URL}/dashboard/bookings/${args.bookingId}`,
  })
  return sendEmail({
    to: args.to,
    subject,
    html: email.html,
    text: email.text,
    userId: args.guestId ?? null,
    preferenceKey: "new_booking",
  })
}
