import { NextRequest, NextResponse } from "next/server"

import { applyMemoryRateLimit, requestIp } from "@/lib/security"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

type BookingRow = Record<string, unknown>
const LISTING_SAFE_FIELDS =
  "id, title, service_type, sauna_type, location, location_address, city, state, country, lat, lng, access_type, access_instructions, access_code_send_timing"
const LISTING_SAFE_FIELDS_FALLBACK =
  "id, title, service_type, sauna_type, location, location_address, city, state, country, lat, lng"
const BOOKING_SELECT_CANDIDATES = [
  "id, listing_id, host_id, guest_id, session_date, start_time, end_time, duration_hours, guest_count, status, subtotal, service_fee, total_charged, price_per_person, access_code, access_code_sent_at, waiver_version, waiver_accepted_at, refund_amount, refund_status, refunded_amount, refunded_at, review_submitted, confirmation_deadline, host_decline_reason, host_actioned_at, created_at, updated_at",
  "id, listing_id, host_id, guest_id, session_date, start_time, end_time, duration_hours, guest_count, status, subtotal, service_fee, total_charged, price_per_person, access_code, access_code_sent_at, refund_amount, refund_status, refunded_amount, refunded_at, review_submitted, confirmation_deadline, host_decline_reason, host_actioned_at, created_at, updated_at",
  "id, listing_id, host_id, guest_id, session_date, start_time, end_time, duration_hours, guest_count, status, subtotal, service_fee, total_charged, price_per_person, access_code, access_code_sent_at, refund_amount, refund_status, review_submitted, confirmation_deadline, host_decline_reason, host_actioned_at, created_at, updated_at",
  "id, listing_id, host_id, guest_id, session_date, start_time, end_time, duration_hours, guest_count, status, subtotal, service_fee, total_charged, price_per_person, access_code, access_code_sent_at, confirmation_deadline, host_decline_reason, host_actioned_at, created_at, updated_at",
  "id, listing_id, host_id, guest_id, session_date, start_time, end_time, duration_hours, guest_count, status, subtotal, service_fee, total_charged, price_per_person, access_code, access_code_sent_at, created_at, updated_at",
  "id, listing_id, host_id, guest_id, session_date, start_time, end_time, duration_hours, guest_count, status, subtotal, service_fee, total_charged, price_per_person, access_code, created_at, updated_at",
] as const

function isMissingColumnError(message: string) {
  const normalized = message.toLowerCase()
  return (
    (normalized.includes("column") && normalized.includes("does not exist")) ||
    (normalized.includes("could not find") &&
      normalized.includes("column") &&
      normalized.includes("schema cache"))
  )
}

function parseSessionEnd(booking: BookingRow) {
  const sessionDate = typeof booking.session_date === "string" ? booking.session_date : null
  if (!sessionDate) return null
  const endTime =
    typeof booking.end_time === "string" && booking.end_time
      ? booking.end_time
      : typeof booking.start_time === "string" && booking.start_time
        ? booking.start_time
        : "23:59"
  const parsed = new Date(`${sessionDate}T${endTime}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function shouldMarkCompleted(booking: BookingRow, now: Date) {
  const status = typeof booking.status === "string" ? booking.status : ""
  if (status !== "confirmed") return false
  const endsAt = parseSessionEnd(booking)
  if (!endsAt) return false
  return endsAt.getTime() < now.getTime()
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const loadBookings = async () => {
    let lastError: string | null = null

    for (const select of BOOKING_SELECT_CANDIDATES) {
      const attempt = await supabase
        .from("bookings")
        .select(select as string)
        .eq("guest_id", user.id)
        .order("session_date", { ascending: true })

      if (!attempt.error) {
        return { data: (attempt.data ?? []) as unknown as BookingRow[], error: null as string | null }
      }

      lastError = attempt.error.message
      if (!isMissingColumnError(attempt.error.message)) {
        return { data: [] as BookingRow[], error: attempt.error.message }
      }
    }

    return { data: [] as BookingRow[], error: lastError ?? "Unable to load bookings." }
  }

  const { data: bookingRows, error } = await loadBookings()
  if (error) return NextResponse.json({ error }, { status: 500 })
  let bookings = bookingRows as BookingRow[]
  const now = new Date()
  const toComplete = bookings.filter((booking) => shouldMarkCompleted(booking, now))
  const completedIds = toComplete
    .map((booking) => (typeof booking.id === "string" ? booking.id : null))
    .filter((value): value is string => Boolean(value))

  if (completedIds.length) {
    const admin = createAdminClient()
    await admin
      .from("bookings")
      .update({ status: "completed" })
      .eq("guest_id", user.id)
      .eq("status", "confirmed")
      .in("id", completedIds)

    bookings = bookings.map((booking) =>
      typeof booking.id === "string" && completedIds.includes(booking.id)
        ? { ...booking, status: "completed" }
        : booking
    )
  }

  const listingIds = Array.from(
    new Set(bookings.map((row) => (typeof row.listing_id === "string" ? row.listing_id : null)).filter(Boolean))
  ) as string[]
  const hostIds = Array.from(
    new Set(bookings.map((row) => (typeof row.host_id === "string" ? row.host_id : null)).filter(Boolean))
  ) as string[]

  const loadListings = async () => {
    if (!listingIds.length) return [] as Record<string, unknown>[]
    const withAccess = await supabase.from("listings").select(LISTING_SAFE_FIELDS).in("id", listingIds)
    if (!withAccess.error) return (withAccess.data ?? []) as Record<string, unknown>[]
    if (!isMissingColumnError(withAccess.error.message)) return [] as Record<string, unknown>[]
    const fallback = await supabase.from("listings").select(LISTING_SAFE_FIELDS_FALLBACK).in("id", listingIds)
    if (!fallback.error) return (fallback.data ?? []) as Record<string, unknown>[]
    return [] as Record<string, unknown>[]
  }

  const [{ data: photosData }, { data: hostsData }, { data: reviewsData }, { data: conversationsData }, listingsData] =
    await Promise.all([
      listingIds.length
        ? supabase
            .from("listing_photos")
            .select("listing_id, url, order_index")
            .in("listing_id", listingIds)
            .order("order_index", { ascending: true })
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      hostIds.length
        ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", hostIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      listingIds.length
        ? supabase
            .from("listing_reviews")
            .select("id, booking_id, listing_id, rating, rating_overall, comment, created_at")
            .eq("guest_id", user.id)
            .in("listing_id", listingIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      bookings.length
        ? supabase
            .from("conversations")
            .select("id, booking_id")
            .in(
              "booking_id",
              bookings
                .map((row) => (typeof row.id === "string" ? row.id : null))
                .filter((value): value is string => Boolean(value))
            )
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      loadListings(),
    ])

  const firstPhotoByListing = new Map<string, string>()
  for (const photo of (photosData ?? []) as Record<string, unknown>[]) {
    const listingId = typeof photo.listing_id === "string" ? photo.listing_id : null
    const url = typeof photo.url === "string" ? photo.url : null
    if (!listingId || !url || firstPhotoByListing.has(listingId)) continue
    firstPhotoByListing.set(listingId, url)
  }

  const listingMap = new Map(
    (listingsData as Record<string, unknown>[]).map((row) => {
      const listingId = typeof row.id === "string" ? row.id : ""
      const fallbackLocation =
        typeof row.location === "string"
          ? row.location
          : [row.city, row.state, row.country]
              .filter((part): part is string => typeof part === "string" && part.length > 0)
              .join(", ")
      return [
        listingId,
        {
          id: listingId,
          title: typeof row.title === "string" ? row.title : null,
          service_type: typeof row.service_type === "string" ? row.service_type : "sauna",
          sauna_type: typeof row.sauna_type === "string" ? row.sauna_type : null,
          location: fallbackLocation || "Location shared after booking",
          location_address: typeof row.location_address === "string" ? row.location_address : null,
          city: typeof row.city === "string" ? row.city : null,
          state: typeof row.state === "string" ? row.state : null,
          country: typeof row.country === "string" ? row.country : null,
          lat: typeof row.lat === "number" ? row.lat : null,
          lng: typeof row.lng === "number" ? row.lng : null,
          photo_url: firstPhotoByListing.get(listingId) ?? null,
          access_type: typeof row.access_type === "string" ? row.access_type : null,
          access_instructions: typeof row.access_instructions === "string" ? row.access_instructions : null,
          access_code_send_timing:
            typeof row.access_code_send_timing === "string" ? row.access_code_send_timing : null,
        },
      ]
    })
  )

  const hostMap = new Map(
    ((hostsData ?? []) as Record<string, unknown>[]).map((row) => [
      typeof row.id === "string" ? row.id : "",
      {
        id: typeof row.id === "string" ? row.id : "",
        full_name: typeof row.full_name === "string" ? row.full_name : null,
        avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
      },
    ])
  )
  const conversationMap = new Map(
    ((conversationsData ?? []) as Record<string, unknown>[]).map((row) => [
      typeof row.booking_id === "string" ? row.booking_id : "",
      typeof row.id === "string" ? row.id : "",
    ])
  )

  const reviewMap = new Map<string, { id: string; rating: number; comment: string | null; created_at: string | null }>()
  for (const row of (reviewsData ?? []) as Record<string, unknown>[]) {
    const bookingId = typeof row.booking_id === "string" ? row.booking_id : null
    if (!bookingId || reviewMap.has(bookingId)) continue
    reviewMap.set(bookingId, {
      id: typeof row.id === "string" ? row.id : "",
      rating: Number(row.rating_overall ?? row.rating ?? 0),
      comment: typeof row.comment === "string" ? row.comment : null,
      created_at: typeof row.created_at === "string" ? row.created_at : null,
    })
  }

  const payload = bookings.map((booking) => {
    const listingId = typeof booking.listing_id === "string" ? booking.listing_id : null
    const hostId = typeof booking.host_id === "string" ? booking.host_id : null
    return {
      id: typeof booking.id === "string" ? booking.id : "",
      listing_id: listingId,
      host_id: hostId,
      guest_id: typeof booking.guest_id === "string" ? booking.guest_id : null,
      session_date: typeof booking.session_date === "string" ? booking.session_date : null,
      start_time: typeof booking.start_time === "string" ? booking.start_time : null,
      end_time: typeof booking.end_time === "string" ? booking.end_time : null,
      duration_hours:
        typeof booking.duration_hours === "number" ? booking.duration_hours : Number(booking.duration_hours ?? 0),
      guest_count: typeof booking.guest_count === "number" ? booking.guest_count : Number(booking.guest_count ?? 0),
      status: typeof booking.status === "string" ? booking.status : "pending",
      subtotal: typeof booking.subtotal === "number" ? booking.subtotal : Number(booking.subtotal ?? 0),
      service_fee: typeof booking.service_fee === "number" ? booking.service_fee : Number(booking.service_fee ?? 0),
      total_charged:
        typeof booking.total_charged === "number" ? booking.total_charged : Number(booking.total_charged ?? 0),
      price_per_person:
        typeof booking.price_per_person === "number"
          ? booking.price_per_person
          : Number(booking.price_per_person ?? 0),
      access_code: typeof booking.access_code === "string" ? booking.access_code : null,
      access_code_sent_at: typeof booking.access_code_sent_at === "string" ? booking.access_code_sent_at : null,
      waiver_version: typeof booking.waiver_version === "string" ? booking.waiver_version : null,
      waiver_accepted_at: typeof booking.waiver_accepted_at === "string" ? booking.waiver_accepted_at : null,
      refund_amount:
        typeof booking.refund_amount === "number" ? booking.refund_amount : Number(booking.refund_amount ?? 0),
      refund_status: typeof booking.refund_status === "string" ? booking.refund_status : null,
      refunded_amount:
        typeof booking.refunded_amount === "number" ? booking.refunded_amount : Number(booking.refunded_amount ?? 0),
      refunded_at: typeof booking.refunded_at === "string" ? booking.refunded_at : null,
      review_submitted: Boolean(booking.review_submitted),
      confirmation_deadline:
        typeof booking.confirmation_deadline === "string" ? booking.confirmation_deadline : null,
      host_decline_reason:
        typeof booking.host_decline_reason === "string" ? booking.host_decline_reason : null,
      host_actioned_at:
        typeof booking.host_actioned_at === "string" ? booking.host_actioned_at : null,
      created_at: typeof booking.created_at === "string" ? booking.created_at : null,
      updated_at: typeof booking.updated_at === "string" ? booking.updated_at : null,
      conversation_id: typeof booking.id === "string" ? conversationMap.get(booking.id) ?? null : null,
      listings: listingId ? listingMap.get(listingId) ?? null : null,
      host: hostId ? hostMap.get(hostId) ?? null : null,
      review: typeof booking.id === "string" ? reviewMap.get(booking.id) ?? null : null,
    }
  })

  return NextResponse.json({ bookings: payload })
}

export async function POST(req: NextRequest) {
  const ip = requestIp(req)
  const limit = applyMemoryRateLimit({
    key: `api:bookings:legacy-post:${ip}`,
    max: 10,
    windowMs: 60_000,
  })
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await req.text()
  return NextResponse.json(
    { error: "Direct booking creation is disabled. Use /api/stripe/checkout." },
    { status: 405 }
  )
}
