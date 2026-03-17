import { redirect } from "next/navigation"

import type { PricingTiers } from "@/lib/pricing"
import { roundUpTo30 } from "@/lib/slots"
import { getServiceTypes } from "@/lib/supabase/queries"
import { createClient } from "@/lib/supabase/server"

import { BookingFlowClient } from "./booking-flow-client"

type Params = {
  id: string
}

type SearchParams = {
  date?: string
  guests?: string
  duration?: string
  startTime?: string
  endTime?: string
}

function buildBookingHref(id: string, query: SearchParams) {
  const params = new URLSearchParams()
  if (query.date) params.set("date", query.date)
  if (query.guests) params.set("guests", query.guests)
  if (query.duration) params.set("duration", query.duration)
  if (query.startTime) params.set("startTime", query.startTime)
  if (query.endTime) params.set("endTime", query.endTime)
  const queryString = params.toString()
  return queryString ? `/book/${id}?${queryString}` : `/book/${id}`
}

function safeNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return fallback
}

function clampDurationHours(hours: number, minMins: number, maxMins: number, increment: number) {
  const mins = Math.round(hours * 60)
  const safeMin = Math.max(30, minMins)
  const safeMax = Math.max(safeMin, maxMins)
  const safeIncrement = Math.max(30, increment)
  const clamped = Math.min(safeMax, Math.max(safeMin, mins))
  const snapped = safeMin + Math.round((clamped - safeMin) / safeIncrement) * safeIncrement
  return Math.min(safeMax, Math.max(safeMin, snapped)) / 60
}

function addHours(start: string, hours: number) {
  const [h, m] = start.split(":").map((part) => Number(part))
  const date = new Date()
  date.setHours(Number.isFinite(h) ? h : 10, Number.isFinite(m) ? m : 0, 0, 0)
  date.setMinutes(date.getMinutes() + hours * 60)
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

function defaultDateIso() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}) {
  const { id } = await params
  const query = await searchParams
  const bookingHref = buildBookingHref(id, query)
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(bookingHref)}`)
  }

  const { data: listing, error } = await supabase
    .from("listings")
    .select("id, title, service_type, is_active, capacity, price_solo, price_2, price_3, price_4plus, min_duration_override_minutes, max_duration_override_minutes, fixed_session_minutes, instant_book, cancellation_policy, listing_photos(url, order_index)")
    .eq("id", id)
    .single()

  if (error || !listing) {
    redirect(`/listings/${id}`)
  }

  if (!listing.is_active) {
    redirect(`/listings/${id}`)
  }

  const maxGuests = Math.max(1, Number(listing.capacity ?? 1))
  const initialGuestCount = Math.min(
    maxGuests,
    Math.max(1, Math.floor(safeNumber(query.guests, Math.min(2, maxGuests))))
  )
  const initialDate = query.date || defaultDateIso()

  const pricing: PricingTiers = {
    price_solo: Number(listing.price_solo ?? 0),
    price_2: listing.price_2 ? Number(listing.price_2) : undefined,
    price_3: listing.price_3 ? Number(listing.price_3) : undefined,
    price_4plus: listing.price_4plus ? Number(listing.price_4plus) : undefined,
  }

  const listingPhotoUrl =
    (listing.listing_photos ?? [])
      .slice()
      .sort((a: { order_index?: number | null }, b: { order_index?: number | null }) => (a.order_index ?? 999) - (b.order_index ?? 999))[0]
      ?.url ?? null

  const serviceTypes = await getServiceTypes()
  const listingServiceType =
    typeof listing.service_type === "string" ? listing.service_type : "sauna"
  const serviceMeta = serviceTypes.find((item) => item.id === listingServiceType)
  const { data: serviceTypeConstraints } = await supabase
    .from("service_types")
    .select("min_duration_minutes, max_duration_minutes, duration_increment_minutes, session_type")
    .eq("id", listingServiceType)
    .maybeSingle()

  const rawIncrementMins = Number(
    serviceMeta?.booking_model === "fixed_session"
      ? listing.fixed_session_minutes ??
          listing.min_duration_override_minutes ??
          serviceTypeConstraints?.min_duration_minutes ??
          30
      : listing.min_duration_override_minutes ?? serviceTypeConstraints?.min_duration_minutes ?? 30
  )
  const blockMins = Math.max(30, roundUpTo30(Number.isFinite(rawIncrementMins) ? rawIncrementMins : 30))
  const minMins = blockMins
  const maxMins =
    serviceMeta?.booking_model === "fixed_session"
      ? blockMins
      : Math.max(
          blockMins,
          Number(listing.max_duration_override_minutes ?? serviceTypeConstraints?.max_duration_minutes ?? 180)
        )
  const increment = 30
  const initialDurationHours = clampDurationHours(
    safeNumber(query.duration, minMins / 60),
    minMins,
    maxMins,
    increment
  )
  const initialStartTime = query.startTime || "10:00"
  const sessionTypeConstraint =
    serviceTypeConstraints?.session_type === "fixed_session" || serviceTypeConstraints?.session_type === "hourly"
      ? serviceTypeConstraints.session_type
      : serviceMeta?.booking_model ?? "hourly"
  const metaFirstName =
    typeof user.user_metadata?.first_name === "string"
      ? user.user_metadata.first_name
      : typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name.split(" ")[0]
        : ""
  const metaLastName =
    typeof user.user_metadata?.last_name === "string"
      ? user.user_metadata.last_name
      : typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name.split(" ").slice(1).join(" ")
        : ""
  const metaFullName = `${metaFirstName} ${metaLastName}`.trim()

  return (
    <BookingFlowClient
      listingId={listing.id}
      listingTitle={listing.title ?? "thrml Wellness Listing"}
      serviceType={listingServiceType}
      listingPhotoUrl={listingPhotoUrl}
      pricing={pricing}
      initialDate={initialDate}
      initialGuestCount={initialGuestCount}
      initialDurationHours={initialDurationHours}
      initialStartTime={initialStartTime}
      initialEndTime={addHours(initialStartTime, initialDurationHours)}
      profileDefaults={{
        fullName:
          metaFullName || ((typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) || ""),
        firstName: metaFirstName,
        lastName: metaLastName,
        email: user.email ?? "",
        phone:
          (typeof user.user_metadata?.phone === "string" && user.user_metadata.phone) || "",
      }}
      healthDisclaimer={serviceMeta?.health_disclaimer ?? null}
      durationConstraints={{
        minMins: Number.isFinite(minMins) ? minMins : 30,
        maxMins: Number.isFinite(maxMins) ? maxMins : 180,
        increment: Number.isFinite(increment) ? increment : 30,
        sessionType: sessionTypeConstraint,
      }}
      instantBook={Boolean(listing.instant_book)}
      cancellationPolicy={typeof listing.cancellation_policy === "string" ? listing.cancellation_policy : null}
    />
  )
}
