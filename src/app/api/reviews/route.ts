import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { applyMemoryRateLimit, requestIp } from "@/lib/security"
import { sendHostNewReviewEmail } from "@/lib/emails"
import { normalizePhotoUrls, normalizeSubRatings } from "@/lib/reviews"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const reviewSchema = z.object({
  bookingId: z.string().uuid(),
  listingId: z.string().uuid().optional(),
  ratingOverall: z.number().int().min(1).max(5),
  ratings: z.record(z.string(), z.number().int().min(1).max(5)).optional(),
  comment: z.string().max(1000).nullable().optional(),
  photoUrls: z.array(z.string().url()).max(3).optional(),
  recommend: z.boolean().nullable().optional(),
})

export async function POST(req: NextRequest) {
  const ip = requestIp(req)
  const limit = applyMemoryRateLimit({
    key: `api:reviews:create:${ip}`,
    max: 10,
    windowMs: 10 * 60_000,
  })
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many review submissions. Please try again later." }, { status: 429 })
  }

  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = reviewSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, guest_id, host_id, listing_id, status")
    .eq("id", parsed.data.bookingId)
    .maybeSingle()

  if (!booking || booking.guest_id !== user.id) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }
  if (booking.status !== "completed") {
    return NextResponse.json({ error: "Only completed bookings can be reviewed" }, { status: 409 })
  }

  const { data: existingReview } = await supabase
    .from("listing_reviews")
    .select("id")
    .eq("booking_id", parsed.data.bookingId)
    .maybeSingle()

  if (existingReview?.id) {
    return NextResponse.json({ error: "Review already exists for this booking" }, { status: 409 })
  }

  const subRatings = normalizeSubRatings(parsed.data.ratings ?? {})
  const photoUrls = normalizePhotoUrls(parsed.data.photoUrls ?? [])
  const recommend = parsed.data.recommend ?? null
  const listingId = booking.listing_id

  const metadata = {
    recommend,
    sub_ratings: subRatings,
    photo_urls: photoUrls,
  }

  const payload: Record<string, unknown> = {
    booking_id: parsed.data.bookingId,
    listing_id: listingId,
    guest_id: user.id,
    rating: parsed.data.ratingOverall,
    rating_overall: parsed.data.ratingOverall,
    rating_cleanliness: subRatings.cleanliness ?? null,
    rating_accuracy: subRatings.accuracy ?? null,
    rating_communication: subRatings.communication ?? null,
    rating_value: subRatings.value ?? null,
    sub_ratings: subRatings,
    comment: parsed.data.comment?.trim() || null,
    photo_urls: photoUrls,
    metadata,
  }

  let insertedReview:
    | {
        id: string
        rating_overall: number | null
        comment: string | null
        rating_cleanliness: number | null
        rating_accuracy: number | null
        rating_communication: number | null
        rating_value: number | null
        is_published: boolean | null
      }
    | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await admin
      .from("listing_reviews")
      .insert(payload)
      .select(
        "id, rating_overall, comment, rating_cleanliness, rating_accuracy, rating_communication, rating_value, is_published"
      )
      .single()
    if (!error) {
      insertedReview = {
        id: typeof data?.id === "string" ? data.id : "",
        rating_overall: Number(data?.rating_overall ?? parsed.data.ratingOverall),
        comment: typeof data?.comment === "string" ? data.comment : null,
        rating_cleanliness:
          typeof data?.rating_cleanliness === "number" ? data.rating_cleanliness : subRatings.cleanliness ?? null,
        rating_accuracy:
          typeof data?.rating_accuracy === "number" ? data.rating_accuracy : subRatings.accuracy ?? null,
        rating_communication:
          typeof data?.rating_communication === "number"
            ? data.rating_communication
            : subRatings.communication ?? null,
        rating_value: typeof data?.rating_value === "number" ? data.rating_value : subRatings.value ?? null,
        is_published:
          typeof data?.is_published === "boolean"
            ? data.is_published
            : true,
      }
      break
    }

    const message = error.message ?? ""
    const missingMatch = message.match(/'([^']+)' column/i)
    const missingColumn = missingMatch?.[1]
    if (!missingColumn || !(missingColumn in payload)) {
      return NextResponse.json({ error: message || "Failed to create review" }, { status: 500 })
    }
    delete payload[missingColumn]
  }

  if (!insertedReview?.id) {
    return NextResponse.json({ error: "Failed to create review" }, { status: 500 })
  }

  await admin
    .from("bookings")
    .update({ review_submitted: true })
    .eq("id", parsed.data.bookingId)
    .eq("guest_id", user.id)

  const [{ data: listing }, { data: hostProfile }, { data: guestProfile }] = await Promise.all([
    admin.from("listings").select("id, title").eq("id", booking.listing_id).maybeSingle(),
    admin.from("profiles").select("full_name, email").eq("id", booking.host_id).maybeSingle(),
    admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ])

  if (insertedReview.is_published !== false) {
    void sendHostNewReviewEmail({
      hostId: booking.host_id ?? null,
      hostEmail: hostProfile?.email ?? null,
      hostFirstName: hostProfile?.full_name ?? null,
      guestFirstName: guestProfile?.full_name ?? null,
      listingTitle: listing?.title ?? "your listing",
      listingId: listing?.id ?? booking.listing_id ?? "",
      ratingOverall: Number(insertedReview.rating_overall ?? parsed.data.ratingOverall),
      comment: insertedReview.comment,
      ratingCleanliness: insertedReview.rating_cleanliness,
      ratingAccuracy: insertedReview.rating_accuracy,
      ratingCommunication: insertedReview.rating_communication,
      ratingValue: insertedReview.rating_value,
    })
  }

  return NextResponse.json({ review_id: insertedReview.id }, { status: 201 })
}
