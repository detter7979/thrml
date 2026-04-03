import { redirect } from "next/navigation"
import { format, fromUnixTime } from "date-fns"

import { stripe } from "@/lib/stripe"
import { createClient } from "@/lib/supabase/server"

import { EarningsClient } from "./earnings-client"

export default async function DashboardEarningsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/dashboard/earnings")

  const [{ data: profile }, { data: listings }, { data: rows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("stripe_account_id, stripe_onboarding_complete, stripe_payouts_enabled, ui_intent, average_rating, total_reviews")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("listings")
      .select("id, title, service_type, is_active")
      .eq("host_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select("id, listing_id, session_date, total_charged, host_payout, service_fee, status, listings(title)")
      .eq("host_id", user.id)
      .in("status", ["confirmed", "completed"])
      .order("session_date", { ascending: false }),
  ])

  const listingIds = (listings ?? [])
    .map((listing) => (typeof listing.id === "string" ? listing.id : null))
    .filter((value): value is string => Boolean(value))

  const { data: reviewRows } = listingIds.length
    ? await supabase
        .from("reviews")
        .select(
          "id, listing_id, rating_overall, rating_cleanliness, rating_accuracy, rating_communication, rating_value"
        )
        .in("listing_id", listingIds)
        .eq("is_published", true)
    : {
        data: [] as Array<{
          id: string
          listing_id: string
          rating_overall: number | null
          rating_cleanliness: number | null
          rating_accuracy: number | null
          rating_communication: number | null
          rating_value: number | null
        }>,
      }

  const { data: listingRatings } = listingIds.length
    ? await supabase.from("listing_ratings").select("listing_id, avg_rating, review_count").in("listing_id", listingIds)
    : { data: [] as Array<{ listing_id: string; avg_rating: number | null; review_count: number | null }> }

  const ratingByListingId = new Map(
    (listingRatings ?? []).map((rating) => [
      typeof rating.listing_id === "string" ? rating.listing_id : "",
      {
        avgRating: rating.avg_rating == null ? null : Number(rating.avg_rating),
        reviewCount: Number(rating.review_count ?? 0),
      },
    ])
  )

  const normalized = (rows ?? []).map((row) => ({
    id: row.id,
    sessionDate: row.session_date,
    totalCharged: Number(row.total_charged ?? 0),
    hostPayout: Number(row.host_payout ?? 0),
    serviceFee: Number(row.service_fee ?? 0),
    listingTitle: row.listings?.[0]?.title ?? "Listing",
  }))

  const hasListings = (listings ?? []).length > 0
  const guestOnly = !hasListings && (profile?.ui_intent ?? "guest") === "guest"
  const hostingEnabled = hasListings || profile?.ui_intent === "host" || profile?.ui_intent === "both"
  if (!hostingEnabled) redirect("/dashboard")
  const isMockHost = profile?.stripe_account_id?.startsWith("acct_mock_")

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const byListing = new Map<
    string,
    {
      totalBookings: number
      bookingsThisMonth: number
      totalEarned: number
      earnedThisMonth: number
    }
  >()

  for (const row of rows ?? []) {
    const listingId = typeof row.listing_id === "string" ? row.listing_id : null
    if (!listingId) continue
    const running = byListing.get(listingId) ?? {
      totalBookings: 0,
      bookingsThisMonth: 0,
      totalEarned: 0,
      earnedThisMonth: 0,
    }
    running.totalBookings += 1
    running.totalEarned += Number(row.host_payout ?? 0)

    if (row.session_date) {
      const sessionDate = new Date(row.session_date)
      if (sessionDate.getMonth() === currentMonth && sessionDate.getFullYear() === currentYear) {
        running.bookingsThisMonth += 1
        running.earnedThisMonth += Number(row.host_payout ?? 0)
      }
    }

    byListing.set(listingId, running)
  }

  const normalizedBreakdown = (listings ?? []).map((listing) => {
    const aggregate = byListing.get(listing.id) ?? {
      totalBookings: 0,
      bookingsThisMonth: 0,
      totalEarned: 0,
      earnedThisMonth: 0,
    }
    const ratings = ratingByListingId.get(listing.id)
    return {
      listingId: listing.id,
      listingTitle: listing.title ?? "Listing",
      serviceType: typeof listing.service_type === "string" ? listing.service_type : "sauna",
      isActive: Boolean(listing.is_active),
      totalBookings: aggregate.totalBookings,
      bookingsThisMonth: aggregate.bookingsThisMonth,
      totalEarned: aggregate.totalEarned,
      earnedThisMonth: aggregate.earnedThisMonth,
      avgRating: ratings?.avgRating ?? null,
      reviewCount: ratings?.reviewCount ?? 0,
    }
  })

  const publishedReviews = reviewRows ?? []
  const averageBy = (
    selector: (row: (typeof publishedReviews)[number]) => number | null | undefined
  ) => {
    const values = publishedReviews
      .map((row) => Number(selector(row) ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0)
    if (!values.length) return 0
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length
    return Number(avg.toFixed(2))
  }

  const ratingSummary = {
    overall: averageBy((row) => row.rating_overall),
    cleanliness: averageBy((row) => row.rating_cleanliness),
    accuracy: averageBy((row) => row.rating_accuracy),
    communication: averageBy((row) => row.rating_communication),
    value: averageBy((row) => row.rating_value),
    totalReviews: publishedReviews.length,
  }

  const reviewsByListing = new Map<string, Array<(typeof publishedReviews)[number]>>()
  for (const review of publishedReviews) {
    if (!review.listing_id) continue
    const current = reviewsByListing.get(review.listing_id) ?? []
    current.push(review)
    reviewsByListing.set(review.listing_id, current)
  }

  const perListingRatings = (listings ?? [])
    .map((listing) => {
      const rowsForListing = reviewsByListing.get(listing.id) ?? []
      if (!rowsForListing.length) {
        return {
          title: listing.title ?? "Listing",
          avgRating: null as number | null,
          reviewCount: 0,
        }
      }
      const overall =
        rowsForListing.reduce((sum, row) => sum + Number(row.rating_overall ?? 0), 0) / rowsForListing.length
      return {
        title: listing.title ?? "Listing",
        avgRating: Number(overall.toFixed(2)),
        reviewCount: rowsForListing.length,
      }
    })
    .sort((a, b) => {
      if (a.avgRating === null && b.avgRating === null) return 0
      if (a.avgRating === null) return 1
      if (b.avgRating === null) return -1
      return b.avgRating - a.avgRating
    })

  let nextPayoutDate: string | null = null
  if (!isMockHost && profile?.stripe_account_id && profile?.stripe_payouts_enabled) {
    const payouts = await stripe.payouts.list(
      { limit: 1, status: "pending" },
      { stripeAccount: profile.stripe_account_id }
    )
    const nextPayout = payouts.data[0]?.arrival_date
    if (typeof nextPayout === "number") {
      nextPayoutDate = format(fromUnixTime(nextPayout), "MMM d, yyyy")
    }
  }

  const stripeOnboardingComplete = Boolean(profile?.stripe_onboarding_complete)

  return (
    <EarningsClient
      rows={normalized}
      breakdownRows={normalizedBreakdown}
      overallAverageRating={
        typeof profile?.average_rating === "number" && Number.isFinite(profile.average_rating)
          ? Number(profile.average_rating)
          : null
      }
      profileTotalReviews={
        typeof profile?.total_reviews === "number" && Number.isFinite(profile.total_reviews)
          ? Math.max(0, Number(profile.total_reviews))
          : 0
      }
      ratingSummary={ratingSummary}
      perListingRatings={perListingRatings}
      stripeConnected={Boolean(
        isMockHost || profile?.stripe_payouts_enabled || stripeOnboardingComplete
      )}
      stripeOnboardingComplete={stripeOnboardingComplete}
      stripeAccountId={profile?.stripe_account_id ?? null}
      nextPayoutDate={nextPayoutDate}
      guestOnly={guestOnly}
    />
  )
}
