import { formatMoney } from "@/lib/cancellations"
import { sendEmail } from "@/lib/emails/send"
import {
  buildBookingCancelledEmail,
  buildBookingConfirmationGuestEmail,
  buildNewBookingHostEmail,
  buildNewReviewHostEmail,
  buildPayoutSentEmail,
  buildPreArrivalReminderEmail,
  buildReviewRequestEmail,
} from "@/lib/emails/templates"

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

function isCodeAccessType(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase() === "code"
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

export async function sendGuestCancellationConfirmation(
  booking: BookingEmailPayload,
  refundAmount: number
) {
  if (!booking.guest_email) return { sent: false, error: "Missing guest email" }
  const email = buildBookingCancelledEmail({
    role: "guest",
    listingTitle: booking.listing_title ?? "Thrml session",
    sessionDate: booking.session_date,
    guestFirstName: booking.guest_name,
    hostFirstName: booking.host_name,
    guestFullName: booking.guest_name,
    cancelledBy: "guest",
    totalCharged: Number(booking.total_charged ?? 0),
    refundAmount,
    refundEligible: refundAmount > 0,
    reason: booking.cancellation_reason ?? null,
  })
  return sendEmail({
    to: booking.guest_email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    userId: booking.guest_id ?? null,
    preferenceKey: "booking_cancelled",
  })
}

export async function sendHostCancellationNotice(
  booking: BookingEmailPayload,
  refundAmount: number,
  penalty?: HostPenaltyEmailPayload,
  cancelledBy: "guest" | "host" = "guest"
) {
  if (!booking.host_email) return { sent: false, error: "Missing host email" }
  const reasonBits = [
    booking.cancellation_reason ? `Reason: ${booking.cancellation_reason}` : null,
    penalty && penalty.penaltyAmount > 0
      ? `Host policy: ${penalty.policyApplied} (${formatMoney(penalty.penaltyAmount)} penalty)`
      : null,
    refundAmount > 0 ? `Refund processed: ${formatMoney(refundAmount)}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const email = buildBookingCancelledEmail({
    role: "host",
    listingTitle: booking.listing_title ?? "Thrml session",
    sessionDate: booking.session_date,
    guestFirstName: booking.guest_name,
    hostFirstName: booking.host_name,
    guestFullName: booking.guest_name,
    cancelledBy,
    totalCharged: Number(booking.total_charged ?? 0),
    refundAmount,
    refundEligible: refundAmount > 0,
    reason: reasonBits || null,
  })

  return sendEmail({
    to: booking.host_email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    userId: booking.host_id ?? null,
    preferenceKey: "booking_cancelled",
  })
}

export async function sendGuestHostCancelledNotice(
  booking: BookingEmailPayload,
  refundAmount: number
) {
  if (!booking.guest_email) return { sent: false, error: "Missing guest email" }
  const email = buildBookingCancelledEmail({
    role: "guest",
    listingTitle: booking.listing_title ?? "Thrml session",
    sessionDate: booking.session_date,
    guestFirstName: booking.guest_name,
    hostFirstName: booking.host_name,
    guestFullName: booking.guest_name,
    cancelledBy: "host",
    totalCharged: Number(booking.total_charged ?? 0),
    refundAmount,
    refundEligible: true,
    reason: booking.cancellation_reason ?? null,
  })
  return sendEmail({
    to: booking.guest_email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    userId: booking.guest_id ?? null,
    preferenceKey: "booking_cancelled",
  })
}

export async function sendHostBookingConfirmedEmail(booking: BookingConfirmedEmailPayload) {
  if (!booking.host_email) return { sent: false, error: "Missing host email" }
  const email = buildNewBookingHostEmail({
    listingTitle: booking.listing_title ?? "Your listing",
    sessionDate: booking.session_date,
    startTime: booking.start_time,
    endTime: booking.end_time,
    guestFullName: booking.guest_name ?? "Guest",
    guestCount: Number(booking.guest_count ?? 1),
    hostPayout: Number(booking.host_payout ?? 0),
    accessCode: isCodeAccessType(booking.listing_access_type) ? booking.access_code : null,
    bookingId: booking.booking_id,
    hostFirstName: booking.host_name,
  })

  return sendEmail({
    to: booking.host_email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    userId: booking.host_id ?? null,
    preferenceKey: "new_booking",
  })
}

export async function sendGuestBookingConfirmedEmail(booking: BookingConfirmedEmailPayload) {
  if (!booking.guest_email) return { sent: false, error: "Missing guest email" }
  const email = buildBookingConfirmationGuestEmail({
    listingTitle: booking.listing_title ?? "Your session",
    locationLabel: booking.listing_location_label ?? null,
    sessionDate: booking.session_date,
    startTime: booking.start_time,
    endTime: booking.end_time,
    guestCount: Number(booking.guest_count ?? 1),
    totalCharged: Number(booking.total_charged ?? 0),
    accessSendTiming: booking.listing_access_code_send_timing ?? null,
    hostFirstName: booking.host_name,
    guestFirstName: booking.guest_name,
    bookingId: booking.booking_id,
    cancellationPolicy: booking.listing_cancellation_policy ?? null,
  })
  return sendEmail({
    to: booking.guest_email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    userId: booking.guest_id ?? null,
    preferenceKey: "new_booking",
  })
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
  const email = buildNewReviewHostEmail({
    hostFirstName: args.hostFirstName,
    guestFirstName: args.guestFirstName,
    listingTitle: args.listingTitle,
    listingId: args.listingId,
    ratingOverall: args.ratingOverall,
    comment: args.comment,
    ratingCleanliness: args.ratingCleanliness,
    ratingAccuracy: args.ratingAccuracy,
    ratingCommunication: args.ratingCommunication,
    ratingValue: args.ratingValue,
  })
  return sendEmail({
    to: args.hostEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
    userId: args.hostId ?? null,
    preferenceKey: "new_review",
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
  const email = buildPayoutSentEmail({
    hostFirstName: args.hostFirstName,
    listingTitle: args.listingTitle,
    sessionDate: args.sessionDate,
    guestFullName: args.guestFullName,
    hostPayout: args.hostPayout,
  })
  return sendEmail({
    to: args.hostEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
    userId: args.hostId ?? null,
    preferenceKey: "payout_sent",
  })
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
  const email = buildPreArrivalReminderEmail({
    guestFirstName: args.guestFirstName,
    hostFirstName: args.hostFirstName,
    listingTitle: args.listingTitle,
    sessionDate: args.sessionDate,
    startTime: args.startTime,
    endTime: args.endTime,
    accessType: args.accessType,
    accessCode: args.accessCode,
    entryInstructions: args.entryInstructions,
    bookingId: args.bookingId,
  })
  return sendEmail({
    to: args.guestEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
    userId: args.guestId ?? null,
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
  const email = buildReviewRequestEmail({
    guestFirstName: args.guestFirstName,
    listingTitle: args.listingTitle,
    bookingId: args.bookingId,
  })
  return sendEmail({
    to: args.guestEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
    userId: args.guestId ?? null,
    preferenceKey: "new_booking",
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
