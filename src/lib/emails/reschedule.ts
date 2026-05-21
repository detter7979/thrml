import { formatBookingTime } from "@/lib/emails/send"
import { sendThrmlLayoutEmail, THRML_APP_URL } from "@/lib/emails/transactional-send"

const APP_URL = THRML_APP_URL

function sessionSummary(
  sessionDate: string | null,
  startTime: string | null,
  endTime: string | null
): string {
  if (!sessionDate || !startTime || !endTime) return "Time TBD"
  return formatBookingTime(`${sessionDate}T${startTime}`, `${sessionDate}T${endTime}`)
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
  const title = args.listingTitle
  const initiator = args.requestedBy === "host" ? "Your host" : "Your guest"
  const bookingUrl = `${APP_URL}/dashboard/bookings?booking=${encodeURIComponent(bookingId)}`
  const subject = `Rescheduled: ${title}`

  const layout = {
    preview: subject,
    kicker: "Rescheduled",
    title: "Booking rescheduled",
    paragraphs: [`${initiator} moved your session for ${title}.`],
    summary: [
      { label: "Was", value: oldWhen },
      { label: "Now", value: newWhen },
    ],
    cta: { label: "View booking", href: bookingUrl },
  }

  const sends: Promise<unknown>[] = []
  if (args.guestEmail) {
    sends.push(sendThrmlLayoutEmail({ to: args.guestEmail, subject, layout, preferenceKey: "new_booking" }))
  }
  if (args.hostEmail) {
    sends.push(sendThrmlLayoutEmail({ to: args.hostEmail, subject, layout, preferenceKey: "new_booking" }))
  }
  await Promise.allSettled(sends)
}
