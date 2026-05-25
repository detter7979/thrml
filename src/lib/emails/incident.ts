import { renderThrmlEmail, buildPlainText } from "@/lib/emails/render-layout"

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://usethrml.com").replace(/\/$/, "")

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function formatBookingReference(bookingId: string) {
  return `#${bookingId.slice(0, 8)}`
}

export async function buildSafetyIncidentGuestEmail(data: {
  name: string
  bookingId: string
  ticketNumber: string
  refundAmount: number
}) {
  const safeName = escapeHtml(data.name)
  const incidentUrl = `${APP_URL}/incident/${encodeURIComponent(data.bookingId)}`
  const bookingRef = escapeHtml(formatBookingReference(data.bookingId))
  const safeTicket = escapeHtml(data.ticketNumber)
  const refundLine =
    data.refundAmount > 0
      ? `We've processed a full refund of $${data.refundAmount.toFixed(2)} for your booking. It should appear on your statement within 5–10 business days.`
      : "We've closed out your support request and documented your booking for our team."

  const layout = {
    preview: "We're here to support you — optional details welcome",
    kicker: "Support",
    title: "We're sorry this happened.",
    greeting: `Hi ${safeName},`,
    paragraphs: [
      "Thank you for reaching out. We know experiences like this can be unsettling, and we want you to know we're taking your report seriously.",
      refundLine,
      "If you're comfortable sharing a bit more about what happened — in your own words, and only what you feel ready to share — we've opened a private space where you can add details or upload photos or documents. This is completely optional and is not required for your refund.",
      `Your support reference is ${safeTicket} (booking ${bookingRef}).`,
    ],
    cta: { label: "Add optional details", href: incidentUrl },
    footnote:
      "If you are in immediate danger, call 911. For urgent help, reply to this email or contact hello@usethrml.com.",
  }

  const html = await renderThrmlEmail(layout)
  const text = buildPlainText(layout)

  return {
    subject: "We're here to support you — optional details welcome",
    html,
    text,
  }
}

export async function buildSafetyIncidentAdminEmail(data: {
  ticketNumber: string
  bookingId: string
  guestName: string
  guestEmail: string
  incidentReportId: string | null
  refundAmount: number
}) {
  const reviewUrl = `${APP_URL}/admin/inbox/disputes`
  const incidentUrl = `${APP_URL}/incident/${encodeURIComponent(data.bookingId)}`
  const safeTicket = escapeHtml(data.ticketNumber)
  const bookingRef = escapeHtml(formatBookingReference(data.bookingId))
  const safeGuest = escapeHtml(data.guestName)
  const safeEmail = escapeHtml(data.guestEmail)
  const refundLine =
    data.refundAmount > 0 ? `$${data.refundAmount.toFixed(2)} (full refund issued)` : "No charge to refund"

  const contentHtml = `
    <p style="margin:0 0 4px;"><strong>Ticket:</strong> ${safeTicket}</p>
    <p style="margin:0 0 4px;"><strong>Booking:</strong> ${bookingRef}</p>
    <p style="margin:0 0 4px;"><strong>Guest:</strong> ${safeGuest} (<a href="mailto:${safeEmail}">${safeEmail}</a>)</p>
    <p style="margin:0 0 4px;"><strong>Category:</strong> Safety Override (safety/injury)</p>
    <p style="margin:0 0 4px;"><strong>Refund:</strong> ${escapeHtml(refundLine)}</p>
    ${
      data.incidentReportId
        ? `<p style="margin:0 0 4px;"><strong>Incident report:</strong> ${escapeHtml(data.incidentReportId)}</p>`
        : `<p style="margin:0 0 4px;color:#C0392B;"><strong>Incident report:</strong> stub creation failed — follow up manually</p>`
    }
    <p style="margin:0 0 14px;"><strong>Guest form:</strong> <a href="${incidentUrl}">${escapeHtml(incidentUrl)}</a></p>
    <p style="margin:0;padding:12px 14px;background:#FFF5F0;border-left:4px solid #C75B3A;font-size:14px;line-height:1.6;">
      Safety Override ran automatically: full refund issued without waiting for the guest incident form. Please review for human follow-up.
    </p>
  `

  const layout = {
    preview: `New safety incident — ${data.ticketNumber}`,
    kicker: "Incidents",
    title: "New safety incident for follow-up",
    paragraphs: [
      "The dispute agent classified this ticket under Safety Override, issued a full refund, and invited the guest to share optional incident details.",
    ],
    contentHtml,
    cta: { label: "Open disputes inbox", href: reviewUrl },
  }

  const html = await renderThrmlEmail(layout)
  const text = buildPlainText(layout)

  return {
    subject: `🛡️ Safety incident — ${data.ticketNumber} (human follow-up)`,
    html,
    text,
  }
}
