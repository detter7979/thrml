import { formatMoney, getPolicyTimeline } from "@/lib/cancellations"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
const FOOTER_UNSUBSCRIBE_URL = `${APP_URL}/dashboard/account#notifications`

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
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

function renderEmailLayout(args: { title: string; intro: string; sections: string[]; ctaLabel: string; ctaUrl: string }) {
  const html = `
    <div style="margin:0;padding:28px 12px;background:#F7F3EE;">
      <div style="max-width:620px;margin:0 auto;background:#FFFFFF;border:1px solid #EADFD2;border-radius:14px;overflow:hidden;font-family:Arial,sans-serif;color:#1F1914;">
        <div style="padding:18px 24px;border-bottom:1px solid #EFE5DA;background:#FFF9F2;">
          <div style="font-size:22px;font-weight:700;letter-spacing:0.4px;">Thrml</div>
        </div>
        <div style="padding:24px;">
          <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;">${args.title}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3E3329;">${args.intro}</p>
          ${args.sections.join("")}
          <p style="margin:24px 0 20px;">
            <a href="${args.ctaUrl}" style="display:inline-block;background:#C75B3A;color:#FFFFFF;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:700;">
              ${args.ctaLabel}
            </a>
          </p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#77685B;">
            You can update notification preferences any time in your account settings:
            <a href="${FOOTER_UNSUBSCRIBE_URL}" style="color:#77685B;text-decoration:underline;">Manage notifications</a>.
          </p>
        </div>
      </div>
    </div>
  `

  return html
}

export type NewBookingHostEmailData = {
  listingTitle: string
  sessionDate: string | null
  startTime: string | null
  endTime: string | null
  guestFullName: string | null
  guestCount: number
  hostPayout: number
  accessCode: string | null
  bookingId: string
  hostFirstName: string | null
}

export function buildNewBookingHostEmail(data: NewBookingHostEmailData) {
  const dateLabel = formatLongDate(data.sessionDate)
  const timeLabel = formatTimeRange(data.sessionDate, data.startTime, data.endTime)
  const safeListing = escapeHtml(data.listingTitle)
  const safeGuest = escapeHtml(data.guestFullName ?? "Guest")
  const safeHost = escapeHtml(firstName(data.hostFirstName))
  const safeAccess = escapeHtml(data.accessCode ?? "Provided in dashboard")
  const ctaUrl = `${APP_URL}/dashboard/bookings/${data.bookingId}`
  const subject = `New booking confirmed — ${data.listingTitle}`

  return {
    subject,
    html: renderEmailLayout({
      title: "You have a new confirmed booking.",
      intro: `Hi ${safeHost},`,
      sections: [
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;"><strong>${safeListing}</strong><br/>Date: ${escapeHtml(dateLabel)}<br/>Time: ${escapeHtml(timeLabel)}<br/>Guest: ${safeGuest}<br/>Guests: ${data.guestCount}<br/>Your payout: ${escapeHtml(formatMoney(data.hostPayout))}</p>`,
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Access code for this session: <strong>${safeAccess}</strong><br/>Share this with your guest or it will be sent automatically 24 hours before their session.</p>`,
      ],
      ctaLabel: "View booking →",
      ctaUrl,
    }),
    text: [
      `Hi ${firstName(data.hostFirstName)},`,
      "",
      "You have a new confirmed booking.",
      `${data.listingTitle}`,
      `Date: ${dateLabel}`,
      `Time: ${timeLabel}`,
      `Guest: ${data.guestFullName ?? "Guest"}`,
      `Guests: ${data.guestCount}`,
      `Your payout: ${formatMoney(data.hostPayout)}`,
      `Access code: ${data.accessCode ?? "Provided in dashboard"}`,
      `View booking: ${ctaUrl}`,
      `Manage notifications: ${FOOTER_UNSUBSCRIBE_URL}`,
    ].join("\n"),
  }
}

export type BookingConfirmationGuestEmailData = {
  listingTitle: string
  locationLabel: string | null
  sessionDate: string | null
  startTime: string | null
  endTime: string | null
  guestCount: number
  totalCharged: number
  accessSendTiming: string | null
  hostFirstName: string | null
  guestFirstName: string | null
  bookingId: string
  cancellationPolicy: string | null
}

export function buildBookingConfirmationGuestEmail(data: BookingConfirmationGuestEmailData) {
  const dateLabel = formatLongDate(data.sessionDate)
  const timeLabel = formatTimeRange(data.sessionDate, data.startTime, data.endTime)
  const safeListing = escapeHtml(data.listingTitle)
  const safeGuest = escapeHtml(firstName(data.guestFirstName))
  const safeHost = escapeHtml(firstName(data.hostFirstName, "your host"))
  const durationLabel = (() => {
    if (!data.sessionDate || !data.startTime || !data.endTime) return "Duration: TBD"
    const start = new Date(`${data.sessionDate}T${data.startTime}`)
    const end = new Date(`${data.sessionDate}T${data.endTime}`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Duration: TBD"
    const minutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60)))
    if (minutes < 60) return `Duration: ${minutes} min`
    if (minutes % 60 === 0) return `Duration: ${minutes / 60} hr`
    return `Duration: ${Math.floor(minutes / 60)} hr ${minutes % 60} min`
  })()
  const policy = getPolicyTimeline(data.cancellationPolicy === "Flexible" ? "Flexible" : data.cancellationPolicy === "Strict" ? "Strict" : "Moderate")
  const cancellationDeadline = (() => {
    if (!data.sessionDate || !data.startTime || policy.fullRefundCutoffHours > 1000) return "your cancellation window closes"
    const start = new Date(`${data.sessionDate}T${data.startTime}`)
    if (Number.isNaN(start.getTime())) return "your cancellation window closes"
    const cutoff = new Date(start.getTime() - policy.fullRefundCutoffHours * 60 * 60 * 1000)
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(cutoff)
  })()
  const ctaUrl = `${APP_URL}/dashboard/bookings/${data.bookingId}`
  const subject = `You're booked — ${data.listingTitle} on ${dateLabel}`
  const accessTimingLabel =
    data.accessSendTiming === "on_confirm"
      ? "shortly"
      : data.accessSendTiming === "1h_before"
        ? "1 hour before your session"
        : "24 hours before your session"
  const accessSection = `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Access details and entry instructions will be sent to you separately ${escapeHtml(accessTimingLabel)}.</p>`

  return {
    subject,
    html: renderEmailLayout({
      title: "Your booking is confirmed.",
      intro: `Hi ${safeGuest},`,
      sections: [
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;"><strong>${safeListing}</strong>${data.locationLabel ? `<br/>Location: ${escapeHtml(data.locationLabel)}` : ""}<br/>Date: ${escapeHtml(dateLabel)}<br/>Time: ${escapeHtml(timeLabel)}<br/>${escapeHtml(durationLabel)}<br/>Guests: ${data.guestCount}<br/>Hosted by: ${safeHost}<br/>Total paid: ${escapeHtml(formatMoney(data.totalCharged))}</p>`,
        accessSection,
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Free cancellation until ${escapeHtml(cancellationDeadline)}.</p>`,
      ],
      ctaLabel: "View booking →",
      ctaUrl,
    }),
    text: [
      `Hi ${firstName(data.guestFirstName)},`,
      "",
      "Your booking is confirmed.",
      `${data.listingTitle}`,
      data.locationLabel ? `Location: ${data.locationLabel}` : null,
      `Date: ${dateLabel}`,
      `Time: ${timeLabel}`,
      durationLabel,
      `Guests: ${data.guestCount}`,
      `Hosted by: ${firstName(data.hostFirstName, "your host")}`,
      `Total paid: ${formatMoney(data.totalCharged)}`,
      `Access details and entry instructions will be sent to you separately ${accessTimingLabel}.`,
      `Free cancellation until ${cancellationDeadline}.`,
      `View booking: ${ctaUrl}`,
      `Manage notifications: ${FOOTER_UNSUBSCRIBE_URL}`,
    ]
      .filter(Boolean)
      .join("\n"),
  }
}

export type BookingCancelledRecipientRole = "guest" | "host"
export type BookingCancelledEmailData = {
  role: BookingCancelledRecipientRole
  listingTitle: string
  sessionDate: string | null
  guestFirstName: string | null
  hostFirstName: string | null
  guestFullName: string | null
  cancelledBy: "guest" | "host"
  totalCharged: number
  refundAmount: number
  refundEligible: boolean
  reason: string | null
}

export function buildBookingCancelledEmail(data: BookingCancelledEmailData) {
  const dateLabel = formatLongDate(data.sessionDate)
  const listing = data.listingTitle
  if (data.role === "guest") {
    const subject = `Your booking has been cancelled — ${listing}`
    const refundLine =
      data.cancelledBy === "host"
        ? `This booking was cancelled by the host. A full refund of ${formatMoney(data.totalCharged)} has been processed and should appear within 5-10 business days.`
        : data.refundEligible
          ? `A refund of ${formatMoney(data.refundAmount)} has been processed.`
          : "Per the cancellation policy, this booking is not eligible for a refund."
    const ctaUrl = `${APP_URL}/explore`
    return {
      subject,
      html: renderEmailLayout({
        title: "Your booking has been cancelled.",
        intro: `Hi ${escapeHtml(firstName(data.guestFirstName))},`,
        sections: [
          `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Your booking for <strong>${escapeHtml(listing)}</strong> on ${escapeHtml(dateLabel)} has been cancelled.</p>`,
          `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${escapeHtml(refundLine)}</p>`,
        ],
        ctaLabel: "Browse spaces →",
        ctaUrl,
      }),
      text: [
        `Hi ${firstName(data.guestFirstName)},`,
        "",
        `Your booking for ${listing} on ${dateLabel} has been cancelled.`,
        refundLine,
        `Browse spaces: ${ctaUrl}`,
        `Manage notifications: ${FOOTER_UNSUBSCRIBE_URL}`,
      ].join("\n"),
    }
  }

  const subject = `Booking cancelled — ${listing} on ${dateLabel}`
  const ctaUrl = `${APP_URL}/dashboard/bookings`
  return {
    subject,
    html: renderEmailLayout({
      title: "A booking was cancelled.",
      intro: `Hi ${escapeHtml(firstName(data.hostFirstName))},`,
      sections: [
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">A booking for <strong>${escapeHtml(listing)}</strong> on ${escapeHtml(dateLabel)} has been cancelled.<br/>Guest: ${escapeHtml(data.guestFullName ?? "Guest")}</p>`,
        data.reason
          ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Reason: ${escapeHtml(data.reason)}</p>`
          : "",
      ],
      ctaLabel: "View dashboard →",
      ctaUrl,
    }),
    text: [
      `Hi ${firstName(data.hostFirstName)},`,
      "",
      `A booking for ${listing} on ${dateLabel} has been cancelled.`,
      `Guest: ${data.guestFullName ?? "Guest"}`,
      data.reason ? `Reason: ${data.reason}` : null,
      `View dashboard: ${ctaUrl}`,
      `Manage notifications: ${FOOTER_UNSUBSCRIBE_URL}`,
    ]
      .filter(Boolean)
      .join("\n"),
  }
}

export type NewReviewHostEmailData = {
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
}

export function buildNewReviewHostEmail(data: NewReviewHostEmailData) {
  const ctaUrl = `${APP_URL}/dashboard/listings/${data.listingId}#reviews`
  const subject = `New review for ${data.listingTitle} — ${data.ratingOverall}★`
  return {
    subject,
    html: renderEmailLayout({
      title: "You received a new review.",
      intro: `Hi ${escapeHtml(firstName(data.hostFirstName))},`,
      sections: [
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${escapeHtml(firstName(data.guestFirstName, "A guest"))} left you a review for <strong>${escapeHtml(data.listingTitle)}</strong>.</p>`,
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">★ ${data.ratingOverall} / 5${data.comment ? `<br/>"${escapeHtml(data.comment)}"` : ""}</p>`,
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Cleanliness: ${data.ratingCleanliness ?? "-"}★<br/>Accuracy: ${data.ratingAccuracy ?? "-"}★<br/>Communication: ${data.ratingCommunication ?? "-"}★<br/>Value: ${data.ratingValue ?? "-"}★</p>`,
      ],
      ctaLabel: "View review →",
      ctaUrl,
    }),
    text: [
      `Hi ${firstName(data.hostFirstName)},`,
      "",
      `${firstName(data.guestFirstName, "A guest")} left you a review for ${data.listingTitle}.`,
      `Overall: ${data.ratingOverall}/5`,
      data.comment ? `"${data.comment}"` : null,
      `Cleanliness: ${data.ratingCleanliness ?? "-"}/5`,
      `Accuracy: ${data.ratingAccuracy ?? "-"}/5`,
      `Communication: ${data.ratingCommunication ?? "-"}/5`,
      `Value: ${data.ratingValue ?? "-"}/5`,
      `View review: ${ctaUrl}`,
      `Manage notifications: ${FOOTER_UNSUBSCRIBE_URL}`,
    ]
      .filter(Boolean)
      .join("\n"),
  }
}

export type PayoutSentEmailData = {
  hostFirstName: string | null
  listingTitle: string
  sessionDate: string | null
  guestFullName: string | null
  hostPayout: number
}

export function buildPayoutSentEmail(data: PayoutSentEmailData) {
  const subject = `Payout sent — ${formatMoney(data.hostPayout)} for ${data.listingTitle}`
  const ctaUrl = `${APP_URL}/dashboard/earnings`
  return {
    subject,
    html: renderEmailLayout({
      title: "Your payout has been sent.",
      intro: `Hi ${escapeHtml(firstName(data.hostFirstName))},`,
      sections: [
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;"><strong>${escapeHtml(data.listingTitle)}</strong><br/>Session date: ${escapeHtml(formatLongDate(data.sessionDate))}<br/>Guest: ${escapeHtml(data.guestFullName ?? "Guest")}<br/>Payout amount: ${escapeHtml(formatMoney(data.hostPayout))}</p>`,
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Payouts typically arrive within 2 business days depending on your bank. You can track the status in your Stripe dashboard.</p>`,
      ],
      ctaLabel: "View earnings →",
      ctaUrl,
    }),
    text: [
      `Hi ${firstName(data.hostFirstName)},`,
      "",
      "Your payout for a completed session has been sent.",
      `${data.listingTitle}`,
      `Session date: ${formatLongDate(data.sessionDate)}`,
      `Guest: ${data.guestFullName ?? "Guest"}`,
      `Payout amount: ${formatMoney(data.hostPayout)}`,
      "Payouts typically arrive within 2 business days depending on your bank.",
      `View earnings: ${ctaUrl}`,
      `Manage notifications: ${FOOTER_UNSUBSCRIBE_URL}`,
    ].join("\n"),
  }
}

export type PreArrivalReminderEmailData = {
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
}

export function buildPreArrivalReminderEmail(data: PreArrivalReminderEmailData) {
  const subject = `Your session tomorrow — ${data.listingTitle}`
  const ctaUrl = `${APP_URL}/dashboard/bookings/${data.bookingId}`
  const isCodeAccess = (data.accessType ?? "").toLowerCase() === "code"
  return {
    subject,
    html: renderEmailLayout({
      title: "Just a reminder that your session is tomorrow.",
      intro: `Hi ${escapeHtml(firstName(data.guestFirstName))},`,
      sections: [
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;"><strong>${escapeHtml(data.listingTitle)}</strong><br/>Date: ${escapeHtml(formatLongDate(data.sessionDate))}<br/>Time: ${escapeHtml(formatTimeRange(data.sessionDate, data.startTime, data.endTime))}</p>`,
        isCodeAccess
          ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Access code: <strong>${escapeHtml(data.accessCode ?? "Provided in booking details")}</strong>${data.entryInstructions ? `<br/>${escapeHtml(data.entryInstructions)}` : ""}</p>`
          : `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Check your messages for entry details from ${escapeHtml(firstName(data.hostFirstName, "your host"))}.</p>`,
      ],
      ctaLabel: "View booking →",
      ctaUrl,
    }),
    text: [
      `Hi ${firstName(data.guestFirstName)},`,
      "",
      "Just a reminder that your session is tomorrow.",
      `${data.listingTitle}`,
      `Date: ${formatLongDate(data.sessionDate)}`,
      `Time: ${formatTimeRange(data.sessionDate, data.startTime, data.endTime)}`,
      isCodeAccess
        ? `Access code: ${data.accessCode ?? "Provided in booking details"}${data.entryInstructions ? `\nEntry instructions: ${data.entryInstructions}` : ""}`
        : `Check your messages for entry details from ${firstName(data.hostFirstName, "your host")}.`,
      `View booking: ${ctaUrl}`,
      `Manage notifications: ${FOOTER_UNSUBSCRIBE_URL}`,
    ].join("\n"),
  }
}

export type ReviewRequestEmailData = {
  guestFirstName: string | null
  listingTitle: string
  bookingId: string
}

export function buildReviewRequestEmail(data: ReviewRequestEmailData) {
  const ctaUrl = `${APP_URL}/review/${data.bookingId}`
  const subject = `How was your session at ${data.listingTitle}?`
  return {
    subject,
    html: renderEmailLayout({
      title: "How was your session?",
      intro: `Hi ${escapeHtml(firstName(data.guestFirstName))},`,
      sections: [
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">We hope you had a great session at <strong>${escapeHtml(data.listingTitle)}</strong>.</p>`,
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Your feedback helps other guests discover great spaces and helps hosts improve.</p>`,
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">This link expires in 14 days.</p>`,
      ],
      ctaLabel: "Leave a review →",
      ctaUrl,
    }),
    text: [
      `Hi ${firstName(data.guestFirstName)},`,
      "",
      `We hope you had a great session at ${data.listingTitle}.`,
      "Your feedback helps other guests discover great spaces and helps hosts improve.",
      `Leave a review: ${ctaUrl}`,
      "This link expires in 14 days.",
      `Manage notifications: ${FOOTER_UNSUBSCRIBE_URL}`,
    ].join("\n"),
  }
}

export type NewsletterWelcomeEmailData = {
  email: string
}

function getNewsletterLinks(email: string) {
  const normalizedAppUrl = APP_URL.replace(/\/$/, "")
  const exploreUrl = `${normalizedAppUrl}/explore`
  const unsubscribeUrl = `${normalizedAppUrl}/unsubscribe?email=${encodeURIComponent(email)}`
  return { exploreUrl, unsubscribeUrl }
}

export function newsletterWelcomeVariantA({ email }: NewsletterWelcomeEmailData) {
  const { exploreUrl, unsubscribeUrl } = getNewsletterLinks(email)

  return {
    subject: "Welcome to Thrml 🌿",
    html: `
      <div style="margin:0;padding:24px;background:#FAF7F4;color:#2C2420;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
        <div style="max-width:600px;margin:0 auto;background:#FAF7F4;">
          <p style="margin:0 0 10px;font-size:14px;letter-spacing:0.2em;font-weight:700;">THRML</p>
          <div style="height:1px;background:#DCCFC3;margin:0 0 24px;"></div>
          <p style="margin:0 0 14px;font-size:24px;line-height:1.3;font-weight:600;">You're in.</p>
          <p style="margin:0 0 14px;font-size:16px;line-height:1.65;">
            Welcome to Thrml — the easiest way to find and book private saunas, cold plunges, float tanks, and other recovery spaces near you.
          </p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#5B4A40;">
            Most spaces start around $15/hour.
          </p>
          <p style="margin:0 0 10px;font-size:16px;line-height:1.6;">Here's what to expect from us:</p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.7;">
            → New spaces in your area<br />
            → Wellness tips and protocols<br />
            → Exclusive early access and offers
          </p>
          <p style="margin:0 0 30px;">
            <a href="${exploreUrl}" style="display:inline-block;background:#8B4513;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;line-height:1;padding:13px 18px;border-radius:999px;">
              Explore spaces near you →
            </a>
          </p>
          <div style="height:1px;background:#DCCFC3;margin:0 0 16px;"></div>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#5B4A40;">
            You're receiving this because you signed up at usethermal.com.<br />
            <a href="${unsubscribeUrl}" style="color:#5B4A40;text-decoration:underline;">Unsubscribe at any time.</a><br />
            Thrml · usethermal.com
          </p>
        </div>
      </div>
    `,
    text: `THRML

You're in.

Welcome to Thrml - the easiest way to find and book private saunas, cold plunges, float tanks, and other recovery spaces near you.

Most spaces start around $15/hour.

Here's what to expect from us:
- New spaces in your area
- Wellness tips and protocols
- Exclusive early access and offers

Explore spaces near you: ${exploreUrl}

You're receiving this because you signed up at usethermal.com.
Unsubscribe at any time: ${unsubscribeUrl}
Thrml · usethermal.com`,
  }
}

export function newsletterWelcomeVariantB({ email }: NewsletterWelcomeEmailData) {
  const { exploreUrl, unsubscribeUrl } = getNewsletterLinks(email)

  return {
    subject: "Welcome to Thrml 🌿",
    html: `
      <div style="margin:0;padding:24px;background:#FAF7F4;color:#2C2420;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
        <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid #E9DED4;border-radius:14px;overflow:hidden;">
          <div style="padding:18px 24px;">
            <p style="margin:0;font-size:14px;letter-spacing:0.2em;font-weight:700;color:#2C2420;">THRML</p>
          </div>
          <div style="height:1px;background:#E3D7CC;"></div>

          <div style="height:120px;background:linear-gradient(135deg,#8B4513 0%,#C4732A 100%);"></div>

          <div style="height:1px;background:#E3D7CC;"></div>
          <div style="padding:28px 24px 24px;">
            <h1 style="margin:0 0 20px;font-size:28px;line-height:1.25;font-weight:700;color:#2C2420;">
              Recovery shouldn't require a membership.
            </h1>

            <p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:#2C2420;">
              Most people don't have a sauna at home. Most wellness clubs cost $150 a month before you've set foot inside.
            </p>
            <p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:#2C2420;">
              Thrml fills that gap — private spaces booked by the hour, from hosts in your neighborhood who built something worth sharing.
            </p>
            <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#6D5E51;">
              You're early. We're glad you're here.
            </p>

            <div style="height:1px;background:#E3D7CC;margin:0 0 16px;"></div>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;">
              <tr>
                <td style="padding-right:8px;vertical-align:top;">
                  <div style="background:#F5EFE9;border-radius:8px;padding:16px;text-align:center;">
                    <div style="font-size:22px;line-height:1;margin-bottom:8px;">🧖</div>
                    <div style="font-size:14px;line-height:1.4;font-weight:700;color:#2C2420;">Private spaces</div>
                    <div style="margin-top:4px;font-size:12px;line-height:1.5;color:#6D5E51;">No front desks</div>
                  </div>
                </td>
                <td style="padding:0 4px;vertical-align:top;">
                  <div style="background:#F5EFE9;border-radius:8px;padding:16px;text-align:center;">
                    <div style="font-size:22px;line-height:1;margin-bottom:8px;">💧</div>
                    <div style="font-size:14px;line-height:1.4;font-weight:700;color:#2C2420;">From $15/hr</div>
                    <div style="margin-top:4px;font-size:12px;line-height:1.5;color:#6D5E51;">Pay only for what you use</div>
                  </div>
                </td>
                <td style="padding-left:8px;vertical-align:top;">
                  <div style="background:#F5EFE9;border-radius:8px;padding:16px;text-align:center;">
                    <div style="font-size:22px;line-height:1;margin-bottom:8px;">⭐</div>
                    <div style="font-size:14px;line-height:1.4;font-weight:700;color:#2C2420;">Instant booking</div>
                    <div style="margin-top:4px;font-size:12px;line-height:1.5;color:#6D5E51;">On select spaces</div>
                  </div>
                </td>
              </tr>
            </table>

            <div style="height:1px;background:#E3D7CC;margin:0 0 18px;"></div>

            <p style="margin:0 0 22px;">
              <a href="${exploreUrl}" style="display:inline-block;background:#8B4513;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;line-height:1;padding:14px 28px;border-radius:999px;">
                Browse spaces near you →
              </a>
            </p>

            <div style="height:1px;background:#E3D7CC;margin:0 0 14px;"></div>
            <p style="margin:0;font-size:12px;line-height:1.65;color:#5B4A40;">
              You're receiving this because you signed up at usethermal.com.<br />
              <a href="${unsubscribeUrl}" style="color:#5B4A40;text-decoration:underline;">Unsubscribe at any time.</a><br />
              Thrml · usethermal.com
            </p>
          </div>
        </div>
      </div>
    `,
    text: `THRML

Recovery shouldn't require a membership.

Most people don't have a sauna at home. Most wellness clubs cost $150 a month before you've set foot inside.

Thrml fills that gap - private spaces booked by the hour, from hosts in your neighborhood who built something worth sharing.

You're early. We're glad you're here.

Private spaces - No front desks
From $15/hr - Pay only for what you use
Instant booking - On select spaces

Browse spaces near you: ${exploreUrl}

You're receiving this because you signed up at usethermal.com.
Unsubscribe at any time: ${unsubscribeUrl}
Thrml · usethermal.com`,
  }
}
