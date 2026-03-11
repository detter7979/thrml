import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { normalizePhotoUrls, normalizeSubRatings } from "@/lib/reviews"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { PricingTiers } from "@/lib/pricing"
import { roundUpTo30 } from "@/lib/slots"
import { getServiceTypes } from "@/lib/supabase/queries"

import { ListingDetailClient } from "./listing-detail-client"

type Params = {
  id: string
}

type ReviewRecord = {
  id: string
  rating_overall: number
  rating_cleanliness: number | null
  rating_accuracy: number | null
  rating_communication: number | null
  rating_value: number | null
  comment: string | null
  photo_urls: string[]
  host_response: string | null
  host_responded_at: string | null
  created_at: string | null
  profile: {
    full_name: string | null
    avatar_url: string | null
  } | null
  recommended: boolean | null
}

type BlackoutDateRecord = {
  blackout_date: string
}

type HostProfileRow = {
  id?: string | null
  full_name?: string | null
  avatar_url?: string | null
  is_superhost?: boolean | null
  created_at?: string | null
  response_rate?: number | null
  response_time?: string | null
  response_time_hours?: number | null
  bio?: string | null
  average_rating?: number | null
  total_reviews?: number | null
}

async function getHostProfile(
  admin: ReturnType<typeof createAdminClient>,
  lookupColumn: "id" | "user_id",
  lookupValue: string
): Promise<HostProfileRow | null> {
  const selectableColumns = [
    "id",
    "full_name",
    "avatar_url",
    "is_superhost",
    "created_at",
    "response_rate",
    "response_time",
    "response_time_hours",
    "bio",
    "average_rating",
    "total_reviews",
  ]

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await admin
      .from("profiles")
      .select(selectableColumns.join(", "))
      .eq(lookupColumn, lookupValue)
      .maybeSingle()

    if (!error) return data as HostProfileRow | null

    const missingColumnMatch = error.message.match(/column\s+profiles\.([a-z_]+)\s+does not exist/i)
    const missingColumn = missingColumnMatch?.[1]
    if (!missingColumn || !selectableColumns.includes(missingColumn)) {
      return null
    }

    const index = selectableColumns.indexOf(missingColumn)
    selectableColumns.splice(index, 1)
    if (!selectableColumns.length) return null
  }

  return null
}

async function fetchListingById(id: string) {
  const supabase = await createClient()
  const { data: listing } = await supabase
    .from("listings")
    .select(
      "id, title, description, city, state, service_type, price_solo, fixed_session_price, session_type, listing_photos(url, order_index)"
    )
    .eq("id", id)
    .single()

  return listing
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { id } = await params
  const listing = await fetchListingById(id)
  if (!listing) return { title: "Listing Not Found | thrml" }

  const price =
    listing.session_type === "fixed_session"
      ? Number(listing.fixed_session_price ?? 0)
      : Number(listing.price_solo ?? 0)
  const firstPhoto = Array.isArray(listing.listing_photos)
    ? [...listing.listing_photos].sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999))[0]
    : undefined
  const title = `${listing.title ?? "thrml Wellness Space"} — ${listing.city ?? "City"}, ${listing.state ?? "State"}`
  const normalizedServiceType = (listing.service_type ?? "wellness_space").replace(/_/g, " ")
  const description = `Book ${listing.title ?? "this space"}, a private ${normalizedServiceType} in ${
    listing.city ?? "your city"
  }, ${listing.state ?? "your state"}. From $${price}. Instant access.`

  return {
    title,
    description,
    alternates: {
      canonical: `https://usethrml.com/listings/${id}`,
    },
    openGraph: {
      title,
      description,
      url: `https://usethrml.com/listings/${id}`,
      images:
        firstPhoto?.url
          ? [
              {
                url: firstPhoto.url,
                width: 1200,
                height: 800,
                alt: listing.title ?? "thrml listing",
              },
            ]
          : undefined,
      type: "website",
    },
  }
}

function toStringArray(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string")
  }
  return fallback
}

function fallbackPhoto(index: number) {
  return `https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=1200&q=80&sig=${index}`
}

export default async function ListingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<{ from?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const backToResultsPath =
    typeof query.from === "string" && query.from.startsWith("/explore") ? query.from : null
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: listing, error }, { data: availabilityRows }] = await Promise.all([
    supabase
      .from("listings")
      .select(
        "id, host_id, title, description, service_type, sauna_type, is_active, location, location_address, location_city, location_state, city, state, country, capacity, price_solo, fixed_session_price, price_2, price_3, price_4plus, min_duration_override_minutes, max_duration_override_minutes, fixed_session_minutes, service_attributes, service_duration_min, service_duration_max, service_duration_unit, amenities, house_rules, cancellation_policy, availability, listing_photos(url, order_index), listing_blackout_dates(blackout_date)"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("availability")
      .select("day_of_week, start_time, end_time, is_available")
      .eq("listing_id", id)
      .order("day_of_week", { ascending: true }),
  ])

  if (error || !listing) {
    notFound()
  }

  let hasPastBooking = false
  if (user?.id) {
    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", id)
      .eq("guest_id", user.id)
      .in("status", ["pending", "confirmed", "completed", "cancelled"])
    hasPastBooking = Number(count ?? 0) > 0
  }

  const isHost = Boolean(user?.id && listing.host_id === user.id)
  const canViewInactive = isHost || hasPastBooking
  if (!listing.is_active && !canViewInactive) {
    notFound()
  }

  const serviceTypes = await getServiceTypes()
  const serviceTypeId =
    typeof listing.service_type === "string" ? listing.service_type : "sauna"
  const serviceType = serviceTypes.find((item) => item.id === serviceTypeId) ?? serviceTypes[0]
  const { data: serviceTypeConstraints } = await supabase
    .from("service_types")
    .select("min_duration_minutes, max_duration_minutes, duration_increment_minutes, session_type")
    .eq("id", serviceTypeId)
    .maybeSingle()

  const rawIncrementMins = Number(
    serviceType?.booking_model === "fixed_session"
      ? listing.fixed_session_minutes ??
          listing.min_duration_override_minutes ??
          serviceTypeConstraints?.min_duration_minutes ??
          30
      : listing.min_duration_override_minutes ?? serviceTypeConstraints?.min_duration_minutes ?? 30
  )
  const bookingBlockMins = Math.max(30, roundUpTo30(Number.isFinite(rawIncrementMins) ? rawIncrementMins : 30))
  const minMins = bookingBlockMins
  const maxMins =
    serviceType?.booking_model === "fixed_session"
      ? bookingBlockMins
      : Math.max(
          bookingBlockMins,
          Number(
            listing.max_duration_override_minutes ?? serviceTypeConstraints?.max_duration_minutes ?? 180
          )
        )
  const increment = 30
  const sessionTypeConstraint =
    serviceTypeConstraints?.session_type === "fixed_session" || serviceTypeConstraints?.session_type === "hourly"
      ? serviceTypeConstraints.session_type
      : serviceType?.booking_model ?? "hourly"

  const hostProfileById = listing.host_id ? await getHostProfile(admin, "id", listing.host_id) : null
  const hostProfileByUserId =
    listing.host_id && !hostProfileById ? await getHostProfile(admin, "user_id", listing.host_id) : null
  const hostProfile = hostProfileById ?? hostProfileByUserId

  const { data: hostStripeById } = listing.host_id
    ? await admin
        .from("profiles")
        .select("stripe_account_id, stripe_payouts_enabled")
        .eq("id", listing.host_id)
        .maybeSingle()
    : { data: null as null }
  const { data: hostStripeByUserId } =
    listing.host_id && !hostStripeById
      ? await admin
          .from("profiles")
          .select("stripe_account_id, stripe_payouts_enabled")
          .eq("user_id", listing.host_id)
          .maybeSingle()
      : { data: null as null }
  const hostStripeProfile = hostStripeById ?? hostStripeByUserId
  const host = hostStripeProfile
  const isMockHost = host?.stripe_account_id?.startsWith("acct_mock_")

  const [{ data: ratingsRow }, reviewsResult] = await Promise.all([
    supabase.from("listing_ratings").select("avg_overall, review_count").eq("listing_id", id).maybeSingle(),
    supabase
      .from("reviews")
      .select(
        "id, rating_overall, rating_cleanliness, rating_accuracy, rating_communication, rating_value, comment, photo_urls, host_response, host_responded_at, created_at, metadata, profiles!reviewer_id(full_name, avatar_url)"
      )
      .eq("listing_id", id)
      .eq("is_published", true)
      .order("created_at", { ascending: false }),
  ])

  let reviews: ReviewRecord[] = []
  if (!reviewsResult.error) {
    reviews = ((reviewsResult.data ?? []) as Record<string, unknown>[]).map((row) => {
      const metadata =
        typeof row.metadata === "object" && row.metadata ? (row.metadata as Record<string, unknown>) : {}
      const recommendedRaw = metadata.recommended
      return {
        id: typeof row.id === "string" ? row.id : "",
        rating_overall: Number(row.rating_overall ?? 0),
        rating_cleanliness: Number.isFinite(Number(row.rating_cleanliness))
          ? Number(row.rating_cleanliness)
          : null,
        rating_accuracy: Number.isFinite(Number(row.rating_accuracy)) ? Number(row.rating_accuracy) : null,
        rating_communication: Number.isFinite(Number(row.rating_communication))
          ? Number(row.rating_communication)
          : null,
        rating_value: Number.isFinite(Number(row.rating_value)) ? Number(row.rating_value) : null,
        comment: typeof row.comment === "string" ? row.comment : null,
        photo_urls: normalizePhotoUrls(row.photo_urls),
        host_response: typeof row.host_response === "string" ? row.host_response : null,
        host_responded_at: typeof row.host_responded_at === "string" ? row.host_responded_at : null,
        created_at: typeof row.created_at === "string" ? row.created_at : null,
        profile:
          Array.isArray(row.profiles) && row.profiles[0] && typeof row.profiles[0] === "object"
            ? {
                full_name:
                  typeof (row.profiles[0] as Record<string, unknown>).full_name === "string"
                    ? ((row.profiles[0] as Record<string, unknown>).full_name as string)
                    : null,
                avatar_url:
                  typeof (row.profiles[0] as Record<string, unknown>).avatar_url === "string"
                    ? ((row.profiles[0] as Record<string, unknown>).avatar_url as string)
                    : null,
              }
            : null,
        recommended:
          typeof recommendedRaw === "boolean"
            ? recommendedRaw
            : recommendedRaw === "true"
              ? true
              : recommendedRaw === "false"
                ? false
                : null,
      }
    })
  } else {
    const { data: fallbackReviews } = await supabase
      .from("listing_reviews")
      .select(
        "id, guest_id, rating, rating_overall, comment, photo_urls, host_response, host_responded_at, created_at, sub_ratings, metadata"
      )
      .eq("listing_id", id)
      .order("created_at", { ascending: false })

    reviews = await Promise.all(
      ((fallbackReviews ?? []) as Record<string, unknown>[]).map(async (review) => {
        const reviewId = typeof review.id === "string" ? review.id : ""
        const subRatings = normalizeSubRatings(
          review.sub_ratings ??
            (typeof review.metadata === "object" && review.metadata
              ? (review.metadata as Record<string, unknown>).sub_ratings
              : {})
        )
        const metadata =
          typeof review.metadata === "object" && review.metadata
            ? (review.metadata as Record<string, unknown>)
            : {}
        const { data: guestProfile } = review.guest_id
          ? await supabase
              .from("profiles")
              .select("full_name, avatar_url")
              .eq("id", review.guest_id)
              .single()
          : { data: null as null }

        return {
          id: reviewId,
          rating_overall: Number(review.rating_overall ?? review.rating ?? 0),
          rating_cleanliness: subRatings.cleanliness ?? null,
          rating_accuracy: subRatings.accuracy ?? null,
          rating_communication: subRatings.communication ?? null,
          rating_value: subRatings.value ?? null,
          comment: typeof review.comment === "string" ? review.comment : null,
          photo_urls: normalizePhotoUrls(
            review.photo_urls ??
              (typeof review.metadata === "object" && review.metadata
                ? (review.metadata as Record<string, unknown>).photo_urls
                : [])
          ),
          host_response: typeof review.host_response === "string" ? review.host_response : null,
          host_responded_at:
            typeof review.host_responded_at === "string" ? review.host_responded_at : null,
          created_at: typeof review.created_at === "string" ? review.created_at : null,
          profile: {
            full_name: guestProfile?.full_name ?? "Guest",
            avatar_url: guestProfile?.avatar_url ?? null,
          },
          recommended:
            typeof metadata.recommend === "boolean"
              ? metadata.recommend
              : metadata.recommend === "true"
                ? true
                : metadata.recommend === "false"
                  ? false
                  : null,
        }
      })
    )
  }

  const photos =
    (listing.listing_photos ?? [])
      .slice()
      .sort((a: { order_index?: number }, b: { order_index?: number }) => (a.order_index ?? 999) - (b.order_index ?? 999))
      .filter((photo: { url?: string }) => Boolean(photo.url))
      .map((photo: { url: string; order_index?: number | null }) => ({
        url: photo.url,
        order_index: photo.order_index ?? null,
      })) || []

  const safePhotos = photos.length
    ? photos
    : [0, 1, 2, 3, 4].map((index) => ({ url: fallbackPhoto(index), order_index: index }))

  const locationLabel =
    [listing.city, listing.state, listing.country, listing.location_city, listing.location_state]
      .filter((part: unknown): part is string => typeof part === "string" && part.length > 0)
      .join(", ") ||
    listing.location ||
    listing.location_address ||
    "Location provided after booking"

  const pricing: PricingTiers = {
    price_solo: Number(listing.price_solo ?? 0),
    price_2: listing.price_2 ? Number(listing.price_2) : undefined,
    price_3: listing.price_3 ? Number(listing.price_3) : undefined,
    price_4plus: listing.price_4plus ? Number(listing.price_4plus) : undefined,
  }
  const listingAvailability = Array.isArray(listing.availability)
    ? (listing.availability as unknown[])
    : []
  const fallbackAvailability = (availabilityRows ?? []).map((row) => ({
    day_of_week: Number(row.day_of_week ?? 0),
    start_time: typeof row.start_time === "string" ? row.start_time : "08:00:00",
    end_time: typeof row.end_time === "string" ? row.end_time : "20:00:00",
    is_available: row.is_available !== false,
  }))
  const availabilityPayload = listingAvailability.length
    ? listingAvailability
    : fallbackAvailability
  const blackoutDates = Array.isArray(listing.listing_blackout_dates)
    ? (listing.listing_blackout_dates as BlackoutDateRecord[])
        .map((row) => row.blackout_date)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    : []

  const lowestPrice =
    sessionTypeConstraint === "fixed_session"
      ? Number(listing.fixed_session_price ?? listing.price_solo ?? 0)
      : Number(listing.price_solo ?? 0)
  const listingSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: listing.title,
    description: listing.description,
    url: `https://usethrml.com/listings/${listing.id}`,
    image: safePhotos.map((photo) => photo.url),
    address: {
      "@type": "PostalAddress",
      addressLocality: listing.city,
      addressRegion: listing.state,
      addressCountry: "US",
    },
    priceRange: `From $${lowestPrice}`,
    aggregateRating:
      Number(ratingsRow?.avg_overall ?? 0) > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: Number(ratingsRow?.avg_overall ?? 0),
            reviewCount: Number(ratingsRow?.review_count ?? 0),
          }
        : undefined,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(listingSchema) }}
      />
      <ListingDetailClient
        id={listing.id}
        title={listing.title ?? "thrml Wellness Listing"}
        locationLabel={locationLabel}
        serviceTypeId={serviceTypeId}
        serviceTypeName={serviceType?.display_name ?? "Sauna"}
        serviceTypeIcon={serviceType?.icon ?? "🔥"}
        bookingModel={serviceType?.booking_model ?? "hourly"}
        healthDisclaimer={serviceType?.health_disclaimer ?? null}
        saunaType={listing.sauna_type ?? null}
        capacity={listing.capacity ? Number(listing.capacity) : null}
        description={listing.description ?? null}
        serviceAttributes={
          typeof listing.service_attributes === "object" && listing.service_attributes
            ? (listing.service_attributes as Record<string, unknown>)
            : {}
        }
        serviceDurationMin={
          typeof listing.service_duration_min === "number" ? Number(listing.service_duration_min) : null
        }
        serviceDurationMax={
          typeof listing.service_duration_max === "number" ? Number(listing.service_duration_max) : null
        }
        serviceDurationUnit={listing.service_duration_unit === "hours" ? "hours" : "minutes"}
        amenities={toStringArray(listing.amenities, ["Cold Plunge", "Towels", "Outdoor Deck"])}
        houseRules={toStringArray(listing.house_rules, ["No smoking", "Respect quiet hours", "Leave on time"])}
        host={
          hostProfile
            ? {
                id: typeof hostProfile.id === "string" ? hostProfile.id : listing.host_id,
                full_name: hostProfile.full_name ?? null,
                avatar_url: hostProfile.avatar_url ?? null,
                is_superhost: hostProfile.is_superhost ?? null,
                created_at: hostProfile.created_at ?? null,
                response_rate:
                  typeof hostProfile.response_rate === "number"
                    ? Number(hostProfile.response_rate)
                    : null,
                response_time:
                  typeof hostProfile.response_time === "string" ? hostProfile.response_time : null,
                response_time_hours:
                  typeof hostProfile.response_time_hours === "number"
                    ? Number(hostProfile.response_time_hours)
                    : null,
                bio: typeof hostProfile.bio === "string" ? hostProfile.bio : null,
                average_rating:
                  typeof hostProfile.average_rating === "number" && Number.isFinite(hostProfile.average_rating)
                    ? Number(hostProfile.average_rating)
                    : null,
                total_reviews:
                  typeof hostProfile.total_reviews === "number" && Number.isFinite(hostProfile.total_reviews)
                    ? Number(hostProfile.total_reviews)
                    : 0,
              }
            : null
        }
        photos={safePhotos}
        reviews={reviews}
        ratings={{
          avg_overall: Number((ratingsRow as Record<string, unknown> | null)?.avg_overall ?? 0),
          review_count: Number((ratingsRow as Record<string, unknown> | null)?.review_count ?? reviews.length),
        }}
        isHostView={Boolean(isHost)}
        pricing={pricing}
        availability={availabilityPayload}
        blackoutDates={blackoutDates}
        durationConstraints={{
          minMins: Number.isFinite(minMins) ? minMins : 30,
          maxMins: Number.isFinite(maxMins) ? maxMins : 180,
          increment: Number.isFinite(increment) ? increment : 30,
          sessionType: sessionTypeConstraint,
        }}
        canReserve={Boolean(listing.is_active)}
        hostPayoutsReady={Boolean(isMockHost || (host?.stripe_account_id && host?.stripe_payouts_enabled))}
        cancellationPolicy={typeof listing.cancellation_policy === "string" ? listing.cancellation_policy : null}
        backToResultsPath={backToResultsPath}
      />
    </>
  )
}
