import { formatBookingTime, sendEmail } from "@/lib/emails/send"

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function sessionSummary(
  sessionDate: string | null,
  startTime: string | null,
  endTime: string | null
): string {
  if (!sessionDate || !startTime || !endTime) return "Time TBD"
  return formatBookingTime(`${sessionDate}T${startTime}`, `${sessionDate}T${endTime}`)
}

function wrap(content: string) {
  return `
  <div style="background:#FAF7F4;padding:32px 16px;font-family:system-ui,Arial,sans-serif;color:#2C2420;">
    <div style="max-width:580px;margin:0 auto;background:#fff;border:1px solid #E9DED4;border-radius:14px;overflow:hidden;">
      <div style="background:#1A1410;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:0.1em;">THRML</span>
      </div>
      <div style="padding:28px 24px;">${content}</div>
      <div style="padding:14px 24px;border-top:1px solid #E9DED4;">
        <p style="margin:0;font-size:12px;color:#796A5E;">
          <a href="${APP_URL}/dashboard/bookings" style="color:#796A5E;">View your bookings</a>
        </p>
      </div>
    </div>
  </div>`
}

export async function sendBookingRescheduledEmails(args: {
  booking: Record<string, unknown>
  listingTitle: string
  guestEmail: string | null
  hostEmail: string | null
  requestedBy: "guest" | "host"
  previousSessionDate: string | null
  previousStartTime: string | null
  previousEndTime: string | null
}) {
  const bookingId = String(args.booking.id ?? "")
  const newWhen = sessionSummary(
    args.booking.session_date as string | null,
    args.booking.start_time as string | null,
    args.booking.end_time as string | null
  )
  const oldWhen = sessionSummary(args.previousSessionDate, args.previousStartTime, args.previousEndTime)
  const title = escapeHtml(args.listingTitle)
  const initiator = args.requestedBy === "host" ? "Your host" : "Your guest"
  const bookingUrl = `${APP_URL}/dashboard/bookings?booking=${encodeURIComponent(bookingId)}`

  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;">Booking rescheduled</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3E3329;">
      ${initiator} moved your session for <strong>${title}</strong>.
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#5B4A40;"><strong>Was:</strong> ${escapeHtml(oldWhen)}</p>
    <p style="margin:0 0 18px;font-size:14px;color:#1F1914;"><strong>Now:</strong> ${escapeHtml(newWhen)}</p>
    <p style="margin:0;">
      <a href="${bookingUrl}" style="display:inline-block;background:#C4623A;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:999px;">
        View booking →
      </a>
    </p>`

  const subject = `Rescheduled: ${args.listingTitle}`
  const text = `Your Thrml booking was rescheduled.\n\nWas: ${oldWhen}\nNow: ${newWhen}\n\n${bookingUrl}`

  const sends: Promise<unknown>[] = []
  if (args.guestEmail) {
    sends.push(sendEmail({ to: args.guestEmail, subject, html: wrap(body), text }))
  }
  if (args.hostEmail) {
    sends.push(sendEmail({ to: args.hostEmail, subject, html: wrap(body), text }))
  }
  await Promise.allSettled(sends)
}
