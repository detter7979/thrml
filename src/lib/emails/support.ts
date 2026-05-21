import { renderThrmlEmail, buildPlainText, type ThrmlEmailLayoutProps } from "@/lib/emails/render-layout"
import { supportResponseTime, type SupportPriority, type SupportSubject } from "@/lib/support"

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")

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

export async function buildSupportConfirmationEmail(data: {
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

  const contentHtml = `
    <div style="margin:0 0 18px;padding:14px 16px;background:#FFF5F0;border:1px solid #FFE8DC;text-align:center;">
      <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#7A6355;">Ticket number</div>
      <div style="margin-top:6px;font-size:30px;font-weight:800;letter-spacing:0.03em;color:#C75B3A;">${safeTicket}</div>
    </div>
    <div style="margin:0 0 16px;padding:14px 16px;border:1px solid #FFE8DC;background:#FFF5F0;font-size:14px;line-height:1.6;">
      <div><strong>Topic:</strong> ${safeSubject}</div>
      ${bookingRef ? `<div><strong>Booking reference:</strong> ${escapeHtml(bookingRef)}</div>` : ""}
    </div>
    <blockquote style="margin:0 0 18px;padding:14px 16px;border-left:4px solid #C75B3A;background:#FFF5F0;color:#3E3329;font-size:14px;line-height:1.6;">
      ${safeMessage}
    </blockquote>`

  const layout: ThrmlEmailLayoutProps = {
    preview: `We received your message — ${data.ticketNumber}`,
    kicker: "Support",
    title: "We received your message.",
    greeting: `Hi ${data.name},`,
    paragraphs: [
      "We received your message and will get back to you as soon as possible.",
      `We typically respond ${responseWindow}.`,
      "Reply to this email to add more detail to your request.",
    ],
    contentHtml,
    cta: { label: "Visit Support Center", href: supportUrl },
  }

  const html = await renderThrmlEmail(layout)

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
    "Thrml · usethrml.com",
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

export async function buildSupportInternalAlertEmail(data: {
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

  const contentHtml = `
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
  `

  const html = await renderThrmlEmail({
    preview: `New support ticket — ${data.ticketNumber}`,
    kicker: "Internal",
    title: "New support ticket",
    contentHtml,
  })

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

export async function buildHumanReviewEscalationEmail(data: {
  ticketNumber: string
  subject: string
  name: string
  email: string
  bookingId: string | null
  disputeCategory: string
  confidence: string
  recommendedAction: string
  refundAmount: number
  refundPct: number
  humanReviewReason: string | null
  classificationReasoning: string
  executionAction?: string | null
  executionError?: string | null
}) {
  const reviewUrl = `${APP_URL}/admin/inbox/disputes`
  const safeTicket = escapeHtml(data.ticketNumber)
  const safeSubject = escapeHtml(data.subject)
  const safeName = escapeHtml(data.name)
  const safeEmail = escapeHtml(data.email)
  const safeCategory = escapeHtml(data.disputeCategory)
  const safeConfidence = escapeHtml(data.confidence)
  const safeAction = escapeHtml(data.recommendedAction)
  const safeReason = escapeHtml(data.humanReviewReason ?? "Agent flagged for human review")
  const safeReasoning = formatMessageHtml(data.classificationReasoning)
  const bookingRef = formatBookingReference(data.bookingId)
  const safeExecution = data.executionAction ? escapeHtml(data.executionAction) : null
  const safeExecError = data.executionError ? escapeHtml(data.executionError) : null
  const refundLine =
    data.refundAmount > 0
      ? `$${data.refundAmount.toFixed(2)} (${data.refundPct}% suggested)`
      : "None suggested"

  const contentHtml = `
      <p style="margin:0 0 4px;"><strong>Ticket:</strong> ${safeTicket}</p>
      <p style="margin:0 0 4px;"><strong>Topic:</strong> ${safeSubject}</p>
      <p style="margin:0 0 4px;"><strong>Guest:</strong> ${safeName} (<a href="mailto:${safeEmail}">${safeEmail}</a>)</p>
      ${bookingRef ? `<p style="margin:0 0 4px;"><strong>Booking:</strong> ${escapeHtml(bookingRef)}</p>` : ""}
      <p style="margin:0 0 4px;"><strong>Category:</strong> ${safeCategory}</p>
      <p style="margin:0 0 4px;"><strong>Confidence:</strong> ${safeConfidence}</p>
      <p style="margin:0 0 4px;"><strong>Recommended action:</strong> ${safeAction}</p>
      <p style="margin:0 0 4px;"><strong>Suggested refund:</strong> ${escapeHtml(refundLine)}</p>
      <p style="margin:0 0 4px;"><strong>Escalation reason:</strong> ${safeReason}</p>
      ${safeExecution ? `<p style="margin:0 0 4px;"><strong>Execution:</strong> ${safeExecution}</p>` : ""}
      ${safeExecError ? `<p style="margin:0 0 14px;color:#C0392B;"><strong>Execution error:</strong> ${safeExecError}</p>` : ""}
      <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#796A5E;">Agent reasoning</p>
      <blockquote style="margin:0;padding:12px 14px;background:#F6F2ED;border-left:4px solid #C75B3A;">
        ${safeReasoning}
      </blockquote>
  `

  const html = await renderThrmlEmail({
    preview: `Human review — ${data.ticketNumber}`,
    kicker: "Disputes",
    title: "Human review required",
    paragraphs: [
      "The dispute agent classified this ticket but did not auto-resolve it. Review and approve in the admin inbox.",
    ],
    contentHtml,
    cta: { label: "Open disputes inbox", href: reviewUrl },
  })

  const text = [
    "Human review required — dispute agent escalation",
    `Review: ${reviewUrl}`,
    "",
    `Ticket: ${data.ticketNumber}`,
    `Topic: ${data.subject}`,
    `Guest: ${data.name} (${data.email})`,
    bookingRef ? `Booking: ${bookingRef}` : null,
    `Category: ${data.disputeCategory}`,
    `Confidence: ${data.confidence}`,
    `Recommended action: ${data.recommendedAction}`,
    `Suggested refund: ${refundLine}`,
    `Escalation reason: ${data.humanReviewReason ?? "Agent flagged for human review"}`,
    data.executionAction ? `Execution: ${data.executionAction}` : null,
    data.executionError ? `Execution error: ${data.executionError}` : null,
    "",
    "Agent reasoning:",
    data.classificationReasoning,
  ]
    .filter(Boolean)
    .join("\n")

  const urgent =
    data.subject.toLowerCase().includes("safety") ||
    (data.humanReviewReason ?? "").toLowerCase().includes("safety")

  return {
    subject: `${urgent ? "🔴 URGENT " : ""}[Human review] ${data.ticketNumber} — ${data.subject}`,
    html,
    text,
  }
}
