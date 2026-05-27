import { sendGuestReviewRequest, sendHostGuestReviewRequestEmail, sendHostPayoutNotice } from "@/lib/emails"
import { createAdminClient } from "@/lib/supabase/admin"

type PostSessionBooking = {
  id: string
  guest_id: string
  host_id: string
  host_payout: number | null
  post_session_email_sent?: boolean | null
  host_review_submitted?: boolean | null
  host_review_requested_at?: string | null
  listings: {
    id: string
    title: string | null
    service_type: string | null
  } | null
  guest_profile: {
    full_name: string | null
    email: string | null
  } | null
  host_profile: {
    full_name: string | null
    email: string | null
  } | null
}

export async function sendPostSessionEmails(
  booking: PostSessionBooking
): Promise<{ sent: boolean; error?: string }> {
  const supabase = createAdminClient()
  if (booking.post_session_email_sent) return { sent: false, error: "Already sent" }

  const listing = booking.listings
  const guest = booking.guest_profile
  const host = booking.host_profile
  if (!listing || !guest?.email || !host?.email) {
    return { sent: false, error: "Missing listing or participant emails" }
  }

  try {
    const hostReviewTasks: Promise<unknown>[] = [
      sendGuestReviewRequest({
        bookingId: booking.id,
        guestId: booking.guest_id,
        guestEmail: guest.email,
        guestFirstName: guest.full_name,
        listingTitle: listing.title ?? "your session",
      }),
      sendHostPayoutNotice({
        hostId: booking.host_id,
        hostEmail: host.email,
        hostFirstName: host.full_name,
        guestFullName: guest.full_name,
        listingTitle: listing.title ?? "your listing",
        sessionDate: null,
        hostPayout: Number(booking.host_payout ?? 0),
      }),
    ]

    if (!booking.host_review_submitted && !booking.host_review_requested_at) {
      hostReviewTasks.push(
        sendHostGuestReviewRequestEmail({
          hostId: booking.host_id,
          hostEmail: host.email,
          hostFirstName: host.full_name,
          guestFullName: guest.full_name,
          listingTitle: listing.title ?? "your listing",
          bookingId: booking.id,
        })
      )
    }

    await Promise.all(hostReviewTasks)

    const bookingUpdates: Record<string, unknown> = { post_session_email_sent: true }
    if (!booking.host_review_submitted && !booking.host_review_requested_at) {
      bookingUpdates.host_review_requested_at = new Date().toISOString()
    }

    await supabase.from("bookings").update(bookingUpdates).eq("id", booking.id)

    return { sent: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown post-session email error"
    console.error("[emails/post-session] failed", { bookingId: booking.id, error: message })
    return { sent: false, error: message }
  }
}
