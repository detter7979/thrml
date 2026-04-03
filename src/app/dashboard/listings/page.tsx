import Link from "next/link"

import { StripeConnectBanner } from "@/components/host/StripeConnectBanner"
import { Button } from "@/components/ui/button"
import { normalizeCancellationPolicy } from "@/lib/cancellations"
import { createClient } from "@/lib/supabase/server"
import { DashboardListingsClient } from "./listings-client"

function isMissingColumnError(message: string) {
  const normalized = message.toLowerCase()
  return (
    (normalized.includes("column") && normalized.includes("does not exist")) ||
    (normalized.includes("could not find") &&
      normalized.includes("column") &&
      normalized.includes("schema cache"))
  )
}

export default async function DashboardListingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: profile }, { data: listings }] = await Promise.all([
    supabase
      .from("profiles")
      .select("ui_intent, stripe_account_id, stripe_payouts_enabled, stripe_onboarding_complete")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
    supabase
      .from("listings")
      .select("*")
      .eq("host_id", user?.id ?? "")
      .order("created_at", { ascending: false }),
  ])

  const allListings = (listings ?? []) as Record<string, unknown>[]
  const previousVersions = allListings.filter(
    (item) =>
      item.is_active === false &&
      typeof item.deactivated_reason === "string" &&
      item.deactivated_reason === "superseded_by_new_version"
  )
  const currentListings = allListings.filter((item) => !previousVersions.includes(item))
  const activeCount = currentListings.filter((item) => item.is_active).length
  const draftCount = currentListings.filter((item) => !item.is_active).length
  const guestOnly = (profile?.ui_intent ?? "guest") === "guest" && (listings ?? []).length === 0
  const hostingEnabled =
    (profile?.ui_intent ?? "guest") === "host" ||
    (profile?.ui_intent ?? "guest") === "both" ||
    (listings ?? []).length > 0
  const isMockHost = profile?.stripe_account_id?.startsWith("acct_mock_")
  const payoutsConnected = Boolean(
    isMockHost ||
      (profile?.stripe_account_id &&
        (profile?.stripe_payouts_enabled || profile?.stripe_onboarding_complete))
  )

  const listingIds = currentListings
    .map((listing) => (typeof listing.id === "string" ? listing.id : null))
    .filter((value): value is string => Boolean(value))

  const today = new Date().toISOString().slice(0, 10)
  const BOOKING_SELECT_CANDIDATES = [
    "id, listing_id, session_date, start_time, end_time, duration_hours, guest_count, status, guest_id, service_fee, total_charged, host_payout, access_code, access_code_sent_at, waiver_accepted, waiver_accepted_at, confirmation_deadline",
    "id, listing_id, session_date, start_time, end_time, duration_hours, guest_count, status, guest_id, service_fee, total_charged, host_payout, access_code, waiver_accepted, waiver_accepted_at, confirmation_deadline",
  ] as const
  const loadBookingRows = async () => {
    if (!listingIds.length) return [] as Record<string, unknown>[]
    for (const select of BOOKING_SELECT_CANDIDATES) {
      const attempt = await supabase
        .from("bookings")
        .select(select as string)
        .in("listing_id", listingIds)
        .in("status", ["pending", "pending_host", "confirmed"])
        .gte("session_date", today)
        .order("session_date", { ascending: true })
      if (!attempt.error) return (attempt.data ?? []) as unknown as Record<string, unknown>[]
      if (!isMissingColumnError(attempt.error.message)) {
        console.error("[dashboard/listings] failed to load bookings", attempt.error.message)
        return [] as Record<string, unknown>[]
      }
    }
    return [] as Record<string, unknown>[]
  }
  const bookingRows = await loadBookingRows()

  const [{ data: listingReviews }, { data: listingRatings }] = await Promise.all([
    listingIds.length
      ? supabase
          .from("listing_reviews")
          .select(
            "id, listing_id, guest_id, rating, rating_overall, rating_cleanliness, rating_accuracy, rating_communication, rating_value, comment, photo_urls, host_response, host_responded_at, created_at, metadata"
          )
          .in("listing_id", listingIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    listingIds.length
      ? supabase.from("listing_ratings").select("*").in("listing_id", listingIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  const guestIds = Array.from(
    new Set((bookingRows ?? []).map((row) => (typeof row.guest_id === "string" ? row.guest_id : null)).filter(Boolean))
  ) as string[]

  const { data: guestProfiles } = guestIds.length
    ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", guestIds)
    : { data: [] as Record<string, unknown>[] }

  const reviewGuestIds = Array.from(
    new Set((listingReviews ?? []).map((row) => (typeof row.guest_id === "string" ? row.guest_id : null)).filter(Boolean))
  ) as string[]
  const { data: reviewGuests } = reviewGuestIds.length
    ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", reviewGuestIds)
    : { data: [] as Record<string, unknown>[] }

  const guestMap = new Map(
    (guestProfiles ?? []).map((row) => [
      typeof row.id === "string" ? row.id : "",
      {
        full_name: typeof row.full_name === "string" ? row.full_name : null,
        avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
      },
    ])
  )

  const reviewGuestById = new Map(
    (reviewGuests ?? []).map((row) => [
      typeof row.id === "string" ? row.id : "",
      {
        full_name: typeof row.full_name === "string" ? row.full_name : "Guest",
        avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
      },
    ])
  )

  const bookingsByListing = new Map<
    string,
    Array<{
      id: string
      session_date: string | null
      start_time: string | null
      end_time: string | null
      status: string
      access_code: string | null
      guest_name: string | null
      guest_avatar_url: string | null
      service_fee: number | null
      total_charged: number | null
      host_payout: number | null
      duration_hours: number | null
      guest_count: number | null
      confirmation_deadline: string | null
      waiver_accepted: boolean
      waiver_accepted_at: string | null
      access_code_sent_at: string | null
    }>
  >()

  for (const row of bookingRows ?? []) {
    const listingId = typeof row.listing_id === "string" ? row.listing_id : null
    if (!listingId) continue
    const value = bookingsByListing.get(listingId) ?? []
    value.push({
      id: typeof row.id === "string" ? row.id : "",
      session_date: typeof row.session_date === "string" ? row.session_date : null,
      start_time: typeof row.start_time === "string" ? row.start_time : null,
      end_time: typeof row.end_time === "string" ? row.end_time : null,
      status: typeof row.status === "string" ? row.status : "pending",
      access_code: typeof row.access_code === "string" ? row.access_code : null,
      guest_name:
        typeof row.guest_id === "string" ? (guestMap.get(row.guest_id)?.full_name ?? "Guest") : "Guest",
      guest_avatar_url:
        typeof row.guest_id === "string" ? (guestMap.get(row.guest_id)?.avatar_url ?? null) : null,
      service_fee: Number(row.service_fee ?? 0),
      total_charged: Number(row.total_charged ?? 0),
      host_payout: Number(row.host_payout ?? 0),
      duration_hours: Number(row.duration_hours ?? 1),
      guest_count: Number(row.guest_count ?? 1),
      confirmation_deadline:
        typeof row.confirmation_deadline === "string" ? row.confirmation_deadline : null,
      waiver_accepted: Boolean(row.waiver_accepted),
      waiver_accepted_at: typeof row.waiver_accepted_at === "string" ? row.waiver_accepted_at : null,
      access_code_sent_at: typeof row.access_code_sent_at === "string" ? row.access_code_sent_at : null,
    })
    bookingsByListing.set(listingId, value)
  }

  const { data: hostCancellationsData, error: hostCancellationsError } = await supabase
    .from("host_cancellations")
    .select("id, booking_id, listing_id, cancelled_at, hours_before_session, penalty_amount, policy_applied")
    .eq("host_id", user?.id ?? "")
    .order("cancelled_at", { ascending: false })

  const hostCancellations = hostCancellationsError ? [] : hostCancellationsData ?? []
  const ninetyDaysAgoMs = new Date(`${today}T00:00:00`).getTime() - 90 * 24 * 60 * 60 * 1000
  const cancellationCountLast90Days = hostCancellations.filter((row) => {
    const timestamp = new Date(typeof row.cancelled_at === "string" ? row.cancelled_at : "").getTime()
    return Number.isFinite(timestamp) && timestamp >= ninetyDaysAgoMs
  }).length

  const listingsWithCancellationData = currentListings
    .map((listing) => {
      const listingId = typeof listing.id === "string" ? listing.id : null
      if (!listingId) return null
      return {
        id: listingId,
        title: typeof listing.title === "string" ? listing.title : "Untitled listing",
        service_type: typeof listing.service_type === "string" ? listing.service_type : "sauna",
        access_type: typeof listing.access_type === "string" ? listing.access_type : null,
        access_code_template:
          typeof listing.access_code_template === "string" ? listing.access_code_template : null,
        access_code_type: typeof listing.access_code_type === "string" ? listing.access_code_type : "static",
        is_active: Boolean(listing.is_active),
        price_from: Number(listing.fixed_session_price ?? listing.price_solo ?? 0),
        cancellation_policy: normalizeCancellationPolicy(listing.cancellation_policy),
        active_booking_count: (bookingsByListing.get(listingId) ?? []).length,
        upcoming_bookings: bookingsByListing.get(listingId) ?? [],
        reviews: ((listingReviews ?? []) as Record<string, unknown>[])
          .filter((row) => row.listing_id === listingId)
          .map((row) => {
            const metadata =
              typeof row.metadata === "object" && row.metadata ? (row.metadata as Record<string, unknown>) : {}
            const subRatings =
              typeof row.sub_ratings === "object" && row.sub_ratings
                ? (row.sub_ratings as Record<string, unknown>)
                : (metadata.sub_ratings as Record<string, unknown> | undefined)
            const guest =
              typeof row.guest_id === "string"
                ? reviewGuestById.get(row.guest_id) ?? { full_name: "Guest", avatar_url: null }
                : { full_name: "Guest", avatar_url: null }
            return {
              id: typeof row.id === "string" ? row.id : "",
              rating_overall: Number(row.rating_overall ?? row.rating ?? 0),
              rating_cleanliness: Number(row.rating_cleanliness ?? subRatings?.cleanliness ?? 0) || null,
              rating_accuracy: Number(row.rating_accuracy ?? subRatings?.accuracy ?? 0) || null,
              rating_communication: Number(row.rating_communication ?? subRatings?.communication ?? 0) || null,
              rating_value: Number(row.rating_value ?? subRatings?.value ?? 0) || null,
              comment: typeof row.comment === "string" ? row.comment : null,
              photo_urls: Array.isArray(row.photo_urls)
                ? row.photo_urls.filter((item): item is string => typeof item === "string")
                : [],
              host_response: typeof row.host_response === "string" ? row.host_response : null,
              host_responded_at: typeof row.host_responded_at === "string" ? row.host_responded_at : null,
              created_at: typeof row.created_at === "string" ? row.created_at : null,
              profile: guest,
              host_name: typeof profile?.ui_intent === "string" ? "Host" : "Host",
            }
          }),
        rating_summary: (() => {
          const row = ((listingRatings ?? []) as Record<string, unknown>[]).find((entry) => entry.listing_id === listingId)
          return {
            avg_overall: Number(row?.avg_overall ?? row?.avg_rating ?? 0),
            review_count: Number(row?.review_count ?? 0),
            avg_cleanliness: Number(row?.avg_cleanliness ?? 0),
            avg_accuracy: Number(row?.avg_accuracy ?? 0),
            avg_communication: Number(row?.avg_communication ?? 0),
            avg_value: Number(row?.avg_value ?? 0),
          }
        })(),
      }
    })
    .filter(Boolean)

  return (
    <div className="space-y-5 px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="hidden md:block">
          <h1 className="font-serif text-3xl text-[#1A1410]">My Spaces</h1>
          <p className="text-sm text-[#7A6A5D]">
            {activeCount} active · {draftCount} draft
          </p>
        </div>
        <Button asChild className="btn-primary">
          <Link href="/dashboard/listings/new">Add a new space</Link>
        </Button>
      </div>

      {hostingEnabled && !payoutsConnected ? (
        <StripeConnectBanner compact payoutsActive={Boolean(profile?.stripe_onboarding_complete)} />
      ) : null}

      {currentListings.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-4xl">🔥</p>
          <h2 className="mt-3 font-serif text-2xl text-[#1A1410]">
            {guestOnly ? "You are in guest mode right now" : "Your first listing is 5 minutes away"}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[#6D5E51]">
            {guestOnly
              ? "When you are ready, create your first space and we will tailor this area to your host activity."
              : "Join Seattle hosts earning an average of $480/month renting their wellness spaces."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-4 text-xs text-[#6D5E51]">
            <span>🔒 You control availability</span>
            <span>💰 Paid weekly to your bank</span>
            <span>📋 Cancel anytime</span>
          </div>
          <Button asChild className="btn-primary mt-6">
            <Link href="/dashboard/listings/new">Create your first listing</Link>
          </Button>
        </div>
      ) : (
        <DashboardListingsClient
          pendingRequests={listingsWithCancellationData
            .flatMap((listing) =>
              listing
                ? listing.upcoming_bookings
                    .filter((booking) => booking.status === "pending_host")
                    .map((booking) => ({
                      id: booking.id,
                      listing_id: listing.id,
                      listing_title: listing.title,
                      session_date: booking.session_date,
                      start_time: booking.start_time,
                      end_time: booking.end_time,
                      duration_hours: booking.duration_hours,
                      guest_count: booking.guest_count,
                      host_payout: booking.host_payout,
                      confirmation_deadline: booking.confirmation_deadline,
                      guest_name: booking.guest_name,
                      guest_avatar_url: booking.guest_avatar_url ?? null,
                    }))
                : []
            )
            .sort((a, b) => (a.confirmation_deadline ?? "").localeCompare(b.confirmation_deadline ?? ""))}
          listings={listingsWithCancellationData.filter(
            (listing): listing is NonNullable<(typeof listingsWithCancellationData)[number]> =>
              listing !== null
          )}
          hostCancellations={hostCancellations.map((row) => ({
            id: typeof row.id === "string" ? row.id : "",
            booking_id: typeof row.booking_id === "string" ? row.booking_id : "",
            listing_id: typeof row.listing_id === "string" ? row.listing_id : "",
            cancelled_at: typeof row.cancelled_at === "string" ? row.cancelled_at : "",
            hours_before_session: Number(row.hours_before_session ?? 0),
            penalty_amount: Number(row.penalty_amount ?? 0),
            policy_applied: typeof row.policy_applied === "string" ? row.policy_applied : "",
          }))}
          cancellationCountLast90Days={cancellationCountLast90Days}
        />
      )}

      {previousVersions.length ? (
        <details className="rounded-2xl bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium text-[#5C4D40]">
            Show previous versions ({previousVersions.length})
          </summary>
          <div className="mt-3 space-y-2">
            {previousVersions.map((listing) => (
              <Link
                key={String(listing.id)}
                href={`/dashboard/listings/${String(listing.id)}/edit`}
                className="flex items-center justify-between rounded-xl border border-[#E9DFD3] px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-[#1A1410]">
                    {typeof listing.title === "string" ? listing.title : "Untitled listing"}{" "}
                    <span className="ml-1 rounded-full bg-[#EFE5D8] px-2 py-0.5 text-[11px] text-[#6D5B4D]">
                      v{Number(listing.version ?? 1)}
                    </span>
                  </p>
                  <p className="text-xs text-[#7A6A5D]">Superseded version</p>
                </div>
                <span className="text-xs text-[#8A796A]">Inactive</span>
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  )
}
