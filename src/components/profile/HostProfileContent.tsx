import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { ListingCard, type ListingCardData } from "@/components/listings/ListingCard"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

type ReviewItem = {
  id: string
  ratingOverall: number
  comment: string | null
  createdAt: string | null
  listingTitle: string
  guestName: string
  guestAvatarUrl: string | null
}

type CategoryAverages = {
  cleanliness: number
  accuracy: number
  communication: number
  value: number
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function firstName(name: string) {
  return name.split(" ").filter(Boolean)[0] ?? "Host"
}

function formatReviewName(fullName: string | null | undefined) {
  const fallback = "Guest"
  if (!fullName) return fallback
  const parts = fullName.trim().split(" ").filter(Boolean)
  if (!parts.length) return fallback
  const first = parts[0]
  const lastInitial = parts.length > 1 ? `${parts[parts.length - 1][0]?.toUpperCase()}.` : ""
  return `${first} ${lastInitial}`.trim()
}

function formatMonthYear(value: string | null) {
  if (!value) return "Recently"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Recently"
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date)
}

function toFixedNumber(value: number, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0
}

function starRow(value: number) {
  const rounded = Math.max(0, Math.min(5, Math.round(value)))
  return "★★★★★".slice(0, rounded).padEnd(5, "☆")
}

function toNumberOrNull(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function getProfileCompat(
  admin: ReturnType<typeof createAdminClient>,
  lookupColumn: "id" | "user_id",
  lookupValue: string
) {
  const selectableColumns = [
    "id",
    "user_id",
    "full_name",
    "avatar_url",
    "tagline",
    "bio",
    "host_since",
    "created_at",
    "average_rating",
    "total_reviews",
    "response_rate",
    "response_time",
    "response_time_hours",
    "languages",
  ]

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await admin
      .from("profiles")
      .select(selectableColumns.join(", "))
      .eq(lookupColumn, lookupValue)
      .maybeSingle()

    if (!error) return data as Record<string, unknown> | null

    const missingColumn =
      error.message.match(/column\s+profiles\.([a-z_]+)\s+does not exist/i)?.[1] ??
      error.message.match(/column\s+([a-z_]+)\s+does not exist/i)?.[1] ??
      null

    if (!missingColumn) return null
    if (missingColumn === lookupColumn) return null

    const index = selectableColumns.indexOf(missingColumn)
    if (index === -1) return null

    selectableColumns.splice(index, 1)
    if (!selectableColumns.length) return null
  }

  return null
}

export async function HostProfileContent({
  hostId,
  visibleReviews = 10,
  backToListingPath,
}: {
  hostId: string
  visibleReviews?: number
  backToListingPath?: string | null
}) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const canViewAsOwner = user?.id === hostId

  const profileById = await getProfileCompat(admin, "id", hostId)
  const profileByUserId = profileById ? null : await getProfileCompat(admin, "user_id", hostId)
  const profile = (profileById ?? profileByUserId) as Record<string, unknown> | null

  const hostIds = Array.from(
    new Set(
      [hostId, profile?.id, profile?.user_id].filter(
        (value): value is string => typeof value === "string" && value.length > 0
      )
    )
  )

  const { data: listingsAll } = hostIds.length
    ? await admin
        .from("listings")
        .select(
          "id, host_id, title, service_type, session_type, price_solo, location_city, location_state, location_address, is_active, created_at"
        )
        .in("host_id", hostIds)
        .order("created_at", { ascending: false })
    : { data: [] as Array<Record<string, unknown>> }

  const allListingIds = (listingsAll ?? [])
    .map((listing) => (typeof listing.id === "string" ? listing.id : null))
    .filter((value): value is string => Boolean(value))

  const { data: listingPhotos } = allListingIds.length
    ? await admin.from("listing_photos").select("listing_id, url, order_index").in("listing_id", allListingIds)
    : { data: [] as Array<Record<string, unknown>> }

  let reviewRows: Array<Record<string, unknown>> = []
  const reviewsPrimary = allListingIds.length
    ? await admin
        .from("reviews")
        .select(
          "id, listing_id, reviewer_id, rating_overall, rating_cleanliness, rating_accuracy, rating_communication, rating_value, comment, created_at"
        )
        .in("listing_id", allListingIds)
        .eq("is_published", true)
        .order("created_at", { ascending: false })
    : { data: [] as Array<Record<string, unknown>>, error: null }

  if (reviewsPrimary.error) {
    const legacyReviews = allListingIds.length
      ? await admin
          .from("listing_reviews")
          .select("id, listing_id, guest_id, rating, rating_overall, comment, created_at, sub_ratings")
          .in("listing_id", allListingIds)
          .order("created_at", { ascending: false })
      : { data: [] as Array<Record<string, unknown>> }

    reviewRows = (legacyReviews.data ?? []).map((row) => {
      const subRatings =
        typeof row.sub_ratings === "object" && row.sub_ratings ? (row.sub_ratings as Record<string, unknown>) : {}
      return {
        id: row.id,
        listing_id: row.listing_id,
        reviewer_id: row.guest_id,
        rating_overall: row.rating_overall ?? row.rating,
        rating_cleanliness: subRatings.cleanliness ?? null,
        rating_accuracy: subRatings.accuracy ?? null,
        rating_communication: subRatings.communication ?? null,
        rating_value: subRatings.value ?? null,
        comment: row.comment,
        created_at: row.created_at,
      }
    })
  } else {
    reviewRows = (reviewsPrimary.data ?? []) as Array<Record<string, unknown>>
  }

  const reviewerIds = Array.from(
    new Set(
      reviewRows
        .map((row) => (typeof row.reviewer_id === "string" ? row.reviewer_id : null))
        .filter((value): value is string => Boolean(value))
    )
  )

  const [{ data: reviewerProfilesById }, { data: reviewerProfilesByUserId }] = await Promise.all([
    reviewerIds.length
      ? admin.from("profiles").select("id, full_name, avatar_url").in("id", reviewerIds)
      : { data: [] as Array<Record<string, unknown>> },
    reviewerIds.length
      ? admin.from("profiles").select("id, user_id, full_name, avatar_url").in("user_id", reviewerIds)
      : { data: [] as Array<Record<string, unknown>> },
  ])

  const reviewerMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()
  for (const row of [...(reviewerProfilesById ?? []), ...(reviewerProfilesByUserId ?? [])]) {
    if (typeof row.id === "string") {
      reviewerMap.set(row.id, {
        full_name: typeof row.full_name === "string" ? row.full_name : null,
        avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
      })
    }
    if ("user_id" in row && typeof row.user_id === "string") {
      reviewerMap.set(row.user_id, {
        full_name: typeof row.full_name === "string" ? row.full_name : null,
        avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
      })
    }
  }

  const listingTitleById = new Map<string, string>()
  for (const listing of listingsAll ?? []) {
    if (typeof listing.id === "string") {
      listingTitleById.set(listing.id, typeof listing.title === "string" ? listing.title : "Space")
    }
  }

  const photosByListingId = new Map<string, Array<{ url: string; order_index: number }>>()
  for (const row of listingPhotos ?? []) {
    const listingId = typeof row.listing_id === "string" ? row.listing_id : null
    const url = typeof row.url === "string" ? row.url : null
    if (!listingId || !url) continue
    const current = photosByListingId.get(listingId) ?? []
    current.push({
      url,
      order_index: Number(row.order_index ?? 999),
    })
    photosByListingId.set(listingId, current)
  }

  const activeListings = (listingsAll ?? []).filter((listing) => listing.is_active === true)
  const hasData = Boolean(profile) || activeListings.length > 0 || reviewRows.length > 0
  if (!hasData && !canViewAsOwner) notFound()

  const profileSafe = profile ?? {
    id: hostId,
    full_name: "Thrml Host",
    avatar_url: null,
    tagline: null,
    bio: null,
    host_since: null,
    created_at: null,
    average_rating: null,
    total_reviews: null,
    response_rate: null,
    response_time: null,
    languages: null,
  }

  const ownerNameFromAuth =
    canViewAsOwner && typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null
  const hostName =
    (typeof profileSafe.full_name === "string" && profileSafe.full_name.trim()) || ownerNameFromAuth || "Thrml Host"
  const hostFirstName = firstName(hostName)
  const hostInitials = initials(hostName || "Host")
  const hostSinceSource =
    typeof profileSafe.host_since === "string"
      ? profileSafe.host_since
      : typeof profileSafe.created_at === "string"
        ? profileSafe.created_at
        : null
  const hostSinceYear = hostSinceSource ? new Date(hostSinceSource).getFullYear() : new Date().getFullYear()

  const listingCards: ListingCardData[] = (activeListings ?? []).map((listing) => {
    const listingId = typeof listing.id === "string" ? listing.id : ""
    const sortedPhotos = [...(photosByListingId.get(listingId) ?? [])].sort(
      (a, b) => (a.order_index ?? 999) - (b.order_index ?? 999)
    )
    const reviewRowsForListing = reviewRows.filter((row) => row.listing_id === listingId)
    const reviewCount = reviewRowsForListing.length
    const avgRating = reviewCount
      ? reviewRowsForListing.reduce((sum, row) => sum + Number(row.rating_overall ?? 0), 0) / reviewCount
      : 0
    const location = [listing.location_city, listing.location_state, listing.location_address]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .slice(0, 2)
      .join(", ")

    return {
      id: listingId,
      title: listing.title ?? "Untitled space",
      location: location || "Location provided after booking",
      bookingModel: listing.session_type === "fixed_session" ? "fixed_session" : "hourly",
      serviceTypeId: listing.service_type ?? null,
      photoUrl: sortedPhotos[0]?.url ?? null,
      priceSolo: Number(listing.price_solo ?? 0),
      rating: toFixedNumber(avgRating, 2),
      reviewCount,
    }
  })

  const reviewItems: ReviewItem[] = reviewRows.map((review) => {
    const reviewerId = typeof review.reviewer_id === "string" ? review.reviewer_id : ""
    const guestProfile = reviewerMap.get(reviewerId)
    const listingId = typeof review.listing_id === "string" ? review.listing_id : ""
    return {
      id: typeof review.id === "string" ? review.id : crypto.randomUUID(),
      ratingOverall: Number(review.rating_overall ?? 0),
      comment: typeof review.comment === "string" ? review.comment : null,
      createdAt: typeof review.created_at === "string" ? review.created_at : null,
      listingTitle: listingTitleById.get(listingId) ?? "Space",
      guestName: formatReviewName(guestProfile?.full_name),
      guestAvatarUrl: typeof guestProfile?.avatar_url === "string" ? guestProfile.avatar_url : null,
    }
  })

  const ratingsSource = reviewRows as Array<Record<string, unknown>>
  const averageFor = (selector: (row: Record<string, unknown>) => number | null | undefined) => {
    const values = ratingsSource
      .map((row) => {
        const raw = selector(row)
        const normalized = Number(raw ?? 0)
        return Number.isFinite(normalized) && normalized > 0 ? normalized : null
      })
      .filter((value): value is number => value !== null)
    if (!values.length) return 0
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    return toFixedNumber(mean, 2)
  }

  const categoryAverages: CategoryAverages = {
    cleanliness: averageFor((row) => row.rating_cleanliness as number | null),
    accuracy: averageFor((row) => row.rating_accuracy as number | null),
    communication: averageFor((row) => row.rating_communication as number | null),
    value: averageFor((row) => row.rating_value as number | null),
  }

  const overallRating = Number(
    profileSafe.average_rating ?? averageFor((row) => row.rating_overall as number | null) ?? 0
  )
  const totalReviews = Number(profileSafe.total_reviews ?? reviewItems.length ?? 0)

  const hostBio =
    typeof profileSafe.bio === "string" && profileSafe.bio.trim().length > 0
      ? profileSafe.bio
      : canViewAsOwner && typeof user?.user_metadata?.bio === "string"
        ? user.user_metadata.bio
        : null
  const hasBio = Boolean(hostBio)
  const responseRate = toNumberOrNull(profileSafe.response_rate)
  const responseTime =
    typeof profileSafe.response_time === "string"
      ? profileSafe.response_time
      : toNumberOrNull(profileSafe.response_time_hours) !== null
        ? `${toNumberOrNull(profileSafe.response_time_hours)}h`
        : null
  const hasResponseRate = responseRate !== null
  const hasResponseTime = Boolean(responseTime && responseTime.trim().length > 0)
  const normalizedLanguages = Array.isArray(profileSafe.languages)
    ? (profileSafe.languages as unknown[]).filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : typeof profileSafe.languages === "string"
      ? profileSafe.languages
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : []
  const hasLanguages = normalizedLanguages.length > 0

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pb-10 pt-2 md:px-8 md:pt-3">
      {backToListingPath ? (
        <section className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href={backToListingPath}
            className="inline-flex items-center gap-1 rounded-full border border-[#DED4C9] px-3 py-1.5 text-[#5D4D41] hover:bg-[#F8F2EA]"
          >
            <ChevronLeft className="size-4" />
            Back to listing
          </Link>
        </section>
      ) : null}

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="size-24">
              <AvatarImage
                src={typeof profileSafe.avatar_url === "string" ? String(profileSafe.avatar_url) : undefined}
                alt={hostName}
              />
              <AvatarFallback>{hostInitials || "TH"}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <h1 className="font-serif text-3xl text-[#1A1410]">{hostName}</h1>
              {typeof profileSafe.tagline === "string" && profileSafe.tagline.trim().length > 0 ? (
                <p className="text-[#6D5E51]">{String(profileSafe.tagline)}</p>
              ) : null}
              <p className="text-sm text-[#4D3F34]">
                <span className="font-medium">★ {overallRating ? overallRating.toFixed(2) : "0.00"}</span>
                <span className="mx-1">·</span>
                <span>{totalReviews} reviews</span>
              </p>
              <p className="text-sm text-[#7A6A5D]">Member since {hostSinceYear}</p>
            </div>
          </div>

          <div className="space-y-1 text-sm text-[#6A5A4D] md:text-right">
            {hasResponseRate ? <p>Response rate: {responseRate}%</p> : null}
            {hasResponseTime ? <p>Response time: {responseTime}</p> : null}
            {hasLanguages ? <p>Languages: {normalizedLanguages.join(", ")}</p> : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[#F8F3EC] p-3">
            <p className="text-xs uppercase tracking-wide text-[#8A7A6D]">Active spaces</p>
            <p className="mt-1 font-serif text-2xl text-[#1A1410]">{listingCards.length}</p>
          </div>
          <div className="rounded-xl bg-[#F8F3EC] p-3">
            <p className="text-xs uppercase tracking-wide text-[#8A7A6D]">Published reviews</p>
            <p className="mt-1 font-serif text-2xl text-[#1A1410]">{reviewItems.length}</p>
          </div>
          <div className="rounded-xl bg-[#F8F3EC] p-3">
            <p className="text-xs uppercase tracking-wide text-[#8A7A6D]">Average rating</p>
            <p className="mt-1 font-serif text-2xl text-[#1A1410]">{overallRating ? overallRating.toFixed(2) : "—"}</p>
          </div>
        </div>

        {totalReviews > 0 ? (
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {[
              { label: "Cleanliness", value: categoryAverages.cleanliness },
              { label: "Accuracy", value: categoryAverages.accuracy },
              { label: "Communication", value: categoryAverages.communication },
              { label: "Value", value: categoryAverages.value },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-[#F8F3EC] px-3 py-2">
                <div className="mb-1 flex items-center justify-between text-xs text-[#5E4E42]">
                  <span>{item.label}</span>
                  <span>{item.value.toFixed(2)}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#E8DDD1]">
                  <div
                    className="h-1.5 rounded-full bg-[#C75B3A]"
                    style={{ width: `${Math.max(0, Math.min(100, (item.value / 5) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="font-serif text-2xl text-[#1A1410]">About {hostFirstName}</h2>
        {hasBio ? (
          <p className="whitespace-pre-wrap leading-7 text-[#3D3027]">{hostBio}</p>
        ) : (
          <p className="text-sm text-[#7A6A5D]">
            {hostFirstName} hasn&apos;t added a bio yet. Check out their spaces and reviews below.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-2xl text-[#1A1410]">{hostFirstName}&apos;s Spaces</h2>
        {listingCards.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listingCards.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#DCCFC1] bg-white p-5 text-sm text-[#7A6A5D]">
            No active spaces right now.
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="font-serif text-2xl text-[#1A1410]">Guest Reviews</h2>

        {reviewItems.length === 0 ? (
          <p className="text-sm text-[#7A6A5D]">No reviews yet</p>
        ) : (
          <>
            <div className="space-y-4">
              {reviewItems.slice(0, visibleReviews).map((review) => (
                <article key={review.id} className="border-b border-[#EFE7DE] pb-4 last:border-b-0">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {review.guestAvatarUrl ? (
                        <img
                          src={review.guestAvatarUrl}
                          alt={review.guestName}
                          className="size-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex size-8 items-center justify-center rounded-full bg-[#ECE2D6] text-xs font-semibold text-[#6E5F52]">
                          {initials(review.guestName)}
                        </div>
                      )}
                      <p className="text-sm font-medium text-[#1A1410]">{review.guestName}</p>
                    </div>
                    <p className="text-xs text-[#8A7A6D]">{formatMonthYear(review.createdAt)}</p>
                  </div>
                  <p className="text-sm text-[#C07A2F]">{starRow(review.ratingOverall)}</p>
                  <p className="mt-2 text-sm text-[#2F2620]">{review.comment || "Great experience."}</p>
                  <p className="mt-1 text-xs text-[#7A6A5D]">Stayed at: {review.listingTitle}</p>
                </article>
              ))}
            </div>

            {reviewItems.length > visibleReviews ? (
              <Link
                href={`/hosts/${hostId}?reviews=${Math.min(reviewItems.length, visibleReviews + 10)}${backToListingPath ? `&from=${encodeURIComponent(backToListingPath)}` : ""}`}
                className="inline-flex rounded-full border border-[#D8C9B9] px-4 py-2 text-sm text-[#5D4D41] hover:bg-[#F8F2EA]"
              >
                Show more
              </Link>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
