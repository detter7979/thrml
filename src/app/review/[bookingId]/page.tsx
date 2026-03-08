import { redirect } from "next/navigation"
import Link from "next/link"

import { ReviewForm } from "@/components/reviews/ReviewForm"
import { extractServiceIcon, formatSessionDate } from "@/lib/reviews"
import { createClient } from "@/lib/supabase/server"

type Params = { bookingId: string }

function failRedirect(): never {
  redirect(`/dashboard/bookings?toast=${encodeURIComponent("This booking can't be reviewed")}`)
}

function formatDuration(value: unknown) {
  const hours = Number(value ?? 0)
  if (!Number.isFinite(hours) || hours <= 0) return "1 hr"
  return `${hours} ${hours === 1 ? "hr" : "hrs"}`
}

export default async function ReviewPage({
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
    redirect(`/login?next=/review/${bookingId}`)
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, guest_id, host_id, listing_id, status, session_date, duration_hours, guest_count, review_requested_at")
    .eq("id", bookingId)
    .maybeSingle()

  if (!booking || booking.guest_id !== user.id || booking.status !== "completed" || !booking.listing_id) {
    failRedirect()
  }

  const fromValue = Array.isArray(query.from) ? query.from[0] : query.from
  const initialRatingRaw = Array.isArray(query.initial_rating) ? query.initial_rating[0] : query.initial_rating
  const initialRating = Number(initialRatingRaw ?? 0)
  const fromDashboard = fromValue === "dashboard"
  const requestedAtRaw =
    typeof booking.review_requested_at === "string" ? booking.review_requested_at : null
  const requestedAt = requestedAtRaw ? new Date(requestedAtRaw) : null
  const nowMs = new Date().getTime()
  const reviewLinkExpired = Boolean(
    !fromDashboard &&
      requestedAt &&
      !Number.isNaN(requestedAt.getTime()) &&
      nowMs - requestedAt.getTime() > 14 * 24 * 60 * 60 * 1000
  )
  const missingRequestedAt = !fromDashboard && !requestedAt

  const [{ data: review }, { data: listing }, { data: photo }, { data: hostProfile }] = await Promise.all([
    supabase.from("listing_reviews").select("id").eq("booking_id", bookingId).maybeSingle(),
    supabase
      .from("listings")
      .select("id, title, service_type")
      .eq("id", booking.listing_id)
      .maybeSingle(),
    supabase
      .from("listing_photos")
      .select("url")
      .eq("listing_id", booking.listing_id)
      .order("order_index", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", booking.host_id).maybeSingle(),
  ])

  if (review?.id || !listing) {
    failRedirect()
  }

  if (reviewLinkExpired || missingRequestedAt) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F3EE] px-4">
        <div className="w-full max-w-lg rounded-3xl bg-white px-6 py-10 text-center shadow-[0_10px_36px_rgba(26,20,16,0.08)]">
          <p className="mb-2 text-3xl">⏳</p>
          <h1 className="font-serif text-3xl text-[#1A1410]">This review link has expired</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm text-[#7A6A5D]">
            No worries - you can still leave a review from your bookings dashboard.
          </p>
          <Link
            href="/dashboard/bookings"
            className="mt-6 inline-flex rounded-xl bg-[#1F1712] px-4 py-2.5 text-sm font-medium text-white"
          >
            Go to your bookings →
          </Link>
        </div>
      </div>
    )
  }

  const title = listing.title ?? "this space"
  const sessionLabel = formatSessionDate(booking.session_date ?? null)
  const serviceIcon = extractServiceIcon(typeof listing.service_type === "string" ? listing.service_type : "sauna")
  const heroUrl =
    photo?.url ??
    "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=1400&q=80"
  const hostFirstName = (hostProfile?.full_name ?? "your host").split(" ")[0]

  return (
    <div className="min-h-screen bg-[#F7F3EE] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-[600px] space-y-6">
        <header className="overflow-hidden rounded-2xl bg-white shadow-[0_6px_30px_rgba(26,20,16,0.08)]">
          <div className="relative h-[200px]">
            <img src={heroUrl} alt={title} className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-4 py-4">
              <p className="text-base font-medium text-white">{title}</p>
              <p className="text-xs text-white/90">{sessionLabel}</p>
            </div>
          </div>
          <div className="space-y-2 px-4 py-4">
            <h1 className="font-serif text-[26px] leading-tight text-[#1A1410]">How was your session at {title}?</h1>
            <p className="text-[13px] text-[#8D7D70]">
              {serviceIcon} {sessionLabel} · {formatDuration(booking.duration_hours)} · {booking.guest_count ?? 1} guests
            </p>
            <p className="text-[12px] text-[#9E8D80]">Your feedback helps {hostFirstName} and future guests.</p>
          </div>
        </header>

        <div className="rounded-2xl bg-[#FBF8F4] p-4 shadow-[0_8px_24px_rgba(26,20,16,0.05)]">
          <ReviewForm
            bookingId={bookingId}
            listingId={booking.listing_id}
            userId={user.id}
            initialRating={Number.isFinite(initialRating) ? initialRating : 0}
          />
        </div>
      </div>
    </div>
  )
}
