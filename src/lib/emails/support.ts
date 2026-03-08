import { supportResponseTime, type SupportPriority, type SupportSubject } from "@/lib/support"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function formatMessageHtml(message: string) {
  return escapeHtml(message).replaceAll("\n", "<br/>")
}

function formatBookingReference(bookingId: string | null) {
  if (!bookingId) return null
  return `#${bookingId.slice(0, 8)}`
}

function formatSubmittedAt(dateIso: string | null | undefined) {
  const date = dateIso ? new Date(dateIso) : new Date()
  if (Number.isNaN(date.getTime())) return "Unknown time"

  const datePart = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(date)

  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  }).format(date)

  return `${datePart} at ${timePart}`
}

export function buildSupportConfirmationEmail(data: {
  name: string
  ticketNumber: string
  subject: SupportSubject
  bookingId: string | null
  message: string
  priority: SupportPriority
}) {
  const safeName = escapeHtml(data.name)
  const safeSubject = escapeHtml(data.subject)
  const safeTicket = escapeHtml(data.ticketNumber)
  const safeMessage = formatMessageHtml(data.message)
  const bookingRef = formatBookingReference(data.bookingId)
  const responseWindow = supportResponseTime(data.priority)
  const supportUrl = `${APP_URL}/support`

  const html = `
    <div style="margin:0;padding:28px 12px;background:#FAF7F4;">
      <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid #E9DDD3;border-radius:14px;overflow:hidden;font-family:Arial,sans-serif;color:#2C2420;">
        <div style="padding:20px 24px;border-bottom:1px solid #EFE4DA;background:#FFF9F4;">
          <div style="font-size:22px;font-weight:700;letter-spacing:0.3px;">Thrml</div>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${safeName},</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">
            We received your message and will get back to you as soon as possible.
          </p>
          <div style="margin:0 0 18px;padding:14px 16px;background:#FDF5EE;border-radius:10px;text-align:center;">
            <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#7A685D;">Ticket number</div>
            <div style="margin-top:6px;font-size:30px;font-weight:800;letter-spacing:0.03em;color:#C75B3A;">
              ${safeTicket}
            </div>
          </div>
          <div style="margin:0 0 16px;padding:14px 16px;border:1px solid #F0E5DB;border-radius:10px;background:#FFFCF9;font-size:14px;line-height:1.6;">
            <div><strong>Topic:</strong> ${safeSubject}</div>
            ${bookingRef ? `<div><strong>Booking reference:</strong> ${escapeHtml(bookingRef)}</div>` : ""}
          </div>
          <blockquote style="margin:0 0 18px;padding:14px 16px;border-left:4px solid #E5D0BF;background:#FAF5F0;border-radius:8px 10px 10px 8px;color:#3B312B;font-size:14px;line-height:1.6;">
            ${safeMessage}
          </blockquote>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.6;">
            We typically respond ${escapeHtml(responseWindow)}.
          </p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">
            Reply to this email to add more detail to your request.
          </p>
          <p style="margin:0 0 20px;">
            <a href="${supportUrl}" style="display:inline-block;background:#C75B3A;color:#FFFFFF;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:700;">
              Visit Support Center →
            </a>
          </p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#7A685D;">Thrml · usethermal.com</p>
        </div>
      </div>
    </div>
  `

  const text = [
    `Hi ${data.name},`,
    "",
    "We received your message and will get back to you as soon as possible.",
    `Ticket number: ${data.ticketNumber}`,
    `Topic: ${data.subject}`,
    bookingRef ? `Booking reference: ${bookingRef}` : null,
    "",
    "Your message:",
    data.message,
    "",
    `Expected response time: ${responseWindow}.`,
    "Reply to this email to add more detail to your request.",
    `Visit Support Center: ${supportUrl}`,
    "Thrml · usethermal.com",
  ]
    .filter(Boolean)
    .join("\n")

  return {
    subject: `We received your message — ${data.ticketNumber}`,
    html,
    text,
  }
}

function priorityFlag(priority: SupportPriority) {
  if (priority === "urgent") return "🔴 URGENT "
  if (priority === "high") return "🟠 HIGH "
  return ""
}

export function buildSupportInternalAlertEmail(data: {
  ticketNumber: string
  priority: SupportPriority
  subject: SupportSubject
  submittedAt: string | null
  name: string
  email: string
  userId: string | null
  bookingId: string | null
  message: string
}) {
  const submittedLabel = formatSubmittedAt(data.submittedAt)
  const safeTicket = escapeHtml(data.ticketNumber)
  const safePriority = escapeHtml(data.priority.toUpperCase())
  const safeSubject = escapeHtml(data.subject)
  const safeName = escapeHtml(data.name)
  const safeEmail = escapeHtml(data.email)
  const safeUserId = escapeHtml(data.userId ?? "Guest (unauthenticated)")
  const safeBooking = escapeHtml(data.bookingId ?? "Not provided")
  const safeMessage = formatMessageHtml(data.message)

  const html = `
    <div style="font-family:Arial,sans-serif;color:#1F1914;line-height:1.55;">
      <h2 style="margin:0 0 12px;">New support ticket</h2>
      <p style="margin:0 0 4px;"><strong>Ticket:</strong> ${safeTicket}</p>
      <p style="margin:0 0 4px;"><strong>Priority:</strong> <strong>${safePriority}</strong></p>
      <p style="margin:0 0 4px;"><strong>Topic:</strong> ${safeSubject}</p>
      <p style="margin:0 0 4px;"><strong>Submitted:</strong> ${escapeHtml(submittedLabel)}</p>
      <p style="margin:0 0 4px;"><strong>Name:</strong> ${safeName}</p>
      <p style="margin:0 0 4px;"><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
      <p style="margin:0 0 4px;"><strong>User ID:</strong> ${safeUserId}</p>
      <p style="margin:0 0 14px;"><strong>Booking ID:</strong> ${safeBooking}</p>
      <blockquote style="margin:0;padding:12px 14px;background:#F6F2ED;border-left:4px solid #C75B3A;">
        ${safeMessage}
      </blockquote>
    </div>
  `

  const text = [
    "New support ticket",
    `Ticket: ${data.ticketNumber}`,
    `Priority: ${data.priority}`,
    `Topic: ${data.subject}`,
    `Submitted: ${submittedLabel}`,
    `Name: ${data.name}`,
    `Email: ${data.email}`,
    `User ID: ${data.userId ?? "Guest (unauthenticated)"}`,
    `Booking ID: ${data.bookingId ?? "Not provided"}`,
    "",
    "Message:",
    data.message,
  ].join("\n")

  return {
    subject: `${priorityFlag(data.priority)}${data.ticketNumber} — ${data.subject}`,
    html,
    text,
  }
}
