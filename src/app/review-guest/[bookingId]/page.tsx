import Link from "next/link"
import { redirect } from "next/navigation"

import { ReviewGuestPageClient } from "./review-guest-page-client"
import { shouldMarkBookingCompleted } from "@/lib/booking-session"
import { formatSessionDate } from "@/lib/reviews"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  PUBLIC_PROFILE_NAME_AVATAR_COLUMNS,
  PUBLIC_PROFILES_TABLE,
} from "@/lib/supabase/public-profiles"
import { createClient } from "@/lib/supabase/server"

type Params = { bookingId: string }

export const metadata = {
  robots: { index: false, follow: false },
}

function failRedirect(): never {
  redirect(`/dashboard/listings?toast=${encodeURIComponent("This booking can't be reviewed")}`)
}

export default async function ReviewGuestPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { bookingId } = await params
  const query = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=/review-guest/${bookingId}`)
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, guest_id, host_id, listing_id, status, session_date, start_time, end_time, duration_hours, guest_count, host_review_requested_at, host_review_submitted"
    )
    .eq("id", bookingId)
    .maybeSingle()

  if (!booking || booking.host_id !== user.id || !booking.listing_id) {
    failRedirect()
  }

  let bookingStatus = typeof booking.status === "string" ? booking.status : ""
  if (bookingStatus === "confirmed" && shouldMarkBookingCompleted(booking)) {
    const admin = createAdminClient()
    const { data: transitioned } = await admin
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", bookingId)
      .eq("host_id", user.id)
      .eq("status", "confirmed")
      .select("id")
      .maybeSingle()
    if (transitioned?.id) {
      bookingStatus = "completed"
    } else {
      const { data: fresh } = await supabase
        .from("bookings")
        .select("status")
        .eq("id", bookingId)
        .eq("host_id", user.id)
        .maybeSingle()
      if (fresh && typeof fresh.status === "string" && fresh.status === "completed") {
        bookingStatus = "completed"
      }
    }
  }

  if (bookingStatus !== "completed") {
    failRedirect()
  }

  const fromValue = Array.isArray(query.from) ? query.from[0] : query.from
  const initialRatingRaw = Array.isArray(query.initial_rating) ? query.initial_rating[0] : query.initial_rating
  const initialRating = Number(initialRatingRaw ?? 0)
  const fromDashboard = fromValue === "dashboard"
  const requestedAtRaw =
    typeof booking.host_review_requested_at === "string" ? booking.host_review_requested_at : null
  const requestedAt = requestedAtRaw ? new Date(requestedAtRaw) : null
  const nowMs = new Date().getTime()
  const reviewLinkExpired = Boolean(
    !fromDashboard &&
      requestedAt &&
      !Number.isNaN(requestedAt.getTime()) &&
      nowMs - requestedAt.getTime() > 14 * 24 * 60 * 60 * 1000
  )
  const missingRequestedAt = !fromDashboard && !requestedAt

  const [{ data: review }, { data: listing }, { data: guestProfile }] = await Promise.all([
    supabase.from("guest_reviews").select("id").eq("booking_id", bookingId).maybeSingle(),
    supabase.from("listings").select("id, title, service_type").eq("id", booking.listing_id).maybeSingle(),
    supabase.from(PUBLIC_PROFILES_TABLE).select(PUBLIC_PROFILE_NAME_AVATAR_COLUMNS).eq("id", booking.guest_id).maybeSingle(),
  ])

  if (review?.id || booking.host_review_submitted || !listing) {
    redirect("/dashboard/listings?toast=" + encodeURIComponent("You've already rated this guest"))
  }

  if (reviewLinkExpired || missingRequestedAt) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F3EE] px-4">
        <div className="w-full max-w-lg rounded-3xl bg-white px-6 py-10 text-center shadow-[0_10px_36px_rgba(26,20,16,0.08)]">
          <p className="mb-2 text-3xl">⏳</p>
          <h1 className="font-serif text-3xl text-[#1A1410]">This rating link has expired</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm text-[#7A6A5D]">
            You can still rate this guest from your listings dashboard under Recent bookings.
          </p>
          <Link
            href="/dashboard/listings"
            className="mt-6 inline-flex rounded-xl bg-[#1F1712] px-4 py-2.5 text-sm font-medium text-white"
          >
            Go to My Spaces →
          </Link>
        </div>
      </div>
    )
  }

  const guestName = guestProfile?.full_name ?? "Guest"
  const title = listing.title ?? "your space"
  const sessionLabel = formatSessionDate(booking.session_date ?? null)
  const guestFirstName = guestName.split(" ")[0] ?? "Guest"

  return (
    <div className="min-h-screen bg-[#F7F3EE] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-[600px] space-y-6">
        <header className="rounded-2xl bg-white px-5 py-6 shadow-[0_6px_30px_rgba(26,20,16,0.08)]">
          <h1 className="font-serif text-[26px] leading-tight text-[#1A1410]">How was {guestFirstName}?</h1>
          <p className="mt-2 text-sm text-[#7A6A5D]">
            Rate your guest after their session at {title} on {sessionLabel}.
          </p>
          <p className="mt-1 text-xs text-[#9E8D80]">
            Star ratings appear on their profile. Notes are only visible to other hosts.
          </p>
        </header>

        <div className="rounded-2xl bg-[#FBF8F4] p-5 shadow-[0_8px_24px_rgba(26,20,16,0.05)]">
          <ReviewGuestPageClient
            bookingId={bookingId}
            guestName={guestName}
            initialRating={Number.isFinite(initialRating) ? initialRating : 0}
          />
        </div>
      </div>
    </div>
  )
}
