import { NextRequest, NextResponse } from "next/server"

import {
  sendGuestEntryInstructionsEmail,
  sendGuestBookingRequestExpiredEmail,
  sendGuestOnsiteReminder,
  sendHostOnsiteReminder,
  sendHostPayoutSentEmail,
  sendPostSessionReviewRequestEmail,
  sendPreArrivalReminderEmail,
} from "@/lib/emails"
import { sendAccessCode } from "@/lib/access/send-access-code"
import { sendAutomatedBookingExpiredMessage } from "@/lib/automated-messages"
import { stripe } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/admin"

type BookingRow = {
  id: string
  guest_id: string
  host_id: string
  listing_id: string | null
  session_date: string | null
  start_time: string | null
  end_time: string | null
  status: string | null
  reminder_sent: boolean | null
  review_submitted: boolean | null
  review_requested_at: string | null
  access_code: string | null
  access_code_sent: boolean | null
  access_code_sent_at: string | null
  host_payout: number | null
}

type ListingRow = {
  id: string
  title: string | null
  access_type: string | null
  access_instructions: string | null
  onsite_contact_name: string | null
  onsite_contact_phone: string | null
  access_code_send_timing: string | null
  location_address?: string | null
  city?: string | null
  state?: string | null
}

function isMissingColumnError(message: string) {
  const normalized = message.toLowerCase()
  return (
    (normalized.includes("column") && normalized.includes("does not exist")) ||
    (normalized.includes("could not find") &&
      normalized.includes("column") &&
      normalized.includes("schema cache"))
  )
}

type ProfileRow = {
  id: string
  full_name: string | null
}

function parseSessionEnd(booking: Pick<BookingRow, "session_date" | "end_time" | "start_time">) {
  if (!booking.session_date) return null
  const endTime = booking.end_time || booking.start_time || "23:59"
  const parsed = new Date(`${booking.session_date}T${endTime}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parseSessionStart(booking: Pick<BookingRow, "session_date" | "start_time">) {
  if (!booking.session_date || !booking.start_time) return null
  const parsed = new Date(`${booking.session_date}T${booking.start_time}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeAccessType(value: string | null | undefined) {
  const key = (value ?? "code").trim().toLowerCase()
  if (key === "keypick" || key === "host_present") return "host_onsite"
  if (key === "smart_lock") return "code"
  if (key === "host_onsite" || key === "other" || key === "lockbox" || key === "code") return key
  return "code"
}

function formatTimeLabel(sessionDate: string | null, time: string | null) {
  if (!sessionDate || !time) return "TBD"
  const parsed = new Date(`${sessionDate}T${time}`)
  if (Number.isNaN(parsed.getTime())) return "TBD"
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

async function getEmailMap(userIds: string[]) {
  const admin = createAdminClient()
  const map = new Map<string, string>()
  for (const userId of userIds) {
    const { data } = await admin.auth.admin.getUserById(userId)
    const email = data.user?.email
    if (email) map.set(userId, email)
  }
  return map
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const supplied =
    req.headers.get("cron_secret") ??
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "")
  if (!secret || supplied !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const tomorrowIsoDate = tomorrow.toISOString().slice(0, 10)

  const { data: expiredPendingHostRows, error: expiredPendingHostError } = await admin
    .from("bookings")
    .select(
      "id, guest_id, host_id, listing_id, session_date, start_time, end_time, status, stripe_payment_intent_id, host_payout, total_charged, guest_count, confirmation_deadline"
    )
    .eq("status", "pending_host")
    .lt("confirmation_deadline", now.toISOString())

  if (expiredPendingHostError) {
    return NextResponse.json({ error: expiredPendingHostError.message }, { status: 500 })
  }

  let expiredRequestsCancelled = 0
  const expiredPendingHost = (expiredPendingHostRows ?? []) as Array<{
    id: string
    guest_id: string
    host_id: string
    listing_id: string
    session_date: string | null
    start_time: string | null
    end_time: string | null
    stripe_payment_intent_id: string | null
    host_payout: number | null
    total_charged: number | null
    guest_count: number | null
    confirmation_deadline: string | null
  }>
  if (expiredPendingHost.length) {
    const listingIds = Array.from(new Set(expiredPendingHost.map((item) => item.listing_id)))
    const profileIds = Array.from(
      new Set(expiredPendingHost.flatMap((item) => [item.guest_id, item.host_id]))
    )
    const [{ data: expiredListings }, { data: expiredProfiles }, emailMap] = await Promise.all([
      listingIds.length
        ? admin.from("listings").select("id, title, service_type").in("id", listingIds)
        : Promise.resolve({ data: [] as Array<{ id: string; title: string | null; service_type: string | null }> }),
      profileIds.length
        ? admin.from("profiles").select("id, full_name").in("id", profileIds)
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }> }),
      getEmailMap(profileIds),
    ])

    const listingMap = new Map((expiredListings ?? []).map((row) => [row.id as string, row]))
    const profileMap = new Map((expiredProfiles ?? []).map((row) => [row.id as string, row]))

    for (const booking of expiredPendingHost) {
      if (booking.stripe_payment_intent_id) {
        try {
          await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id)
        } catch {
          // Non-blocking: continue with cancellation state.
        }
      }

      const { data: updated } = await admin
        .from("bookings")
        .update({
          status: "cancelled",
          host_actioned_at: new Date().toISOString(),
          host_decline_reason: "auto_cancelled_deadline",
        })
        .eq("id", booking.id)
        .eq("status", "pending_host")
        .select("id")
        .maybeSingle()
      if (!updated?.id) continue

      await admin.from("booked_slots").delete().eq("booking_id", booking.id)
      expiredRequestsCancelled += 1

      const listing = listingMap.get(booking.listing_id)
      const guest = profileMap.get(booking.guest_id)
      const host = profileMap.get(booking.host_id)

      void Promise.allSettled([
        sendGuestBookingRequestExpiredEmail({
          booking_id: booking.id,
          listing_title: listing?.title ?? "Thrml session",
          listing_id: booking.listing_id,
          service_type: listing?.service_type ?? "sauna",
          session_date: booking.session_date,
          start_time: booking.start_time,
          end_time: booking.end_time,
          guest_count: Number(booking.guest_count ?? 1),
          total_charged: Number(booking.total_charged ?? 0),
          host_payout: Number(booking.host_payout ?? 0),
          guest_id: booking.guest_id,
          guest_name: guest?.full_name ?? null,
          guest_email: emailMap.get(booking.guest_id) ?? null,
          host_id: booking.host_id,
          host_name: host?.full_name ?? null,
          host_email: emailMap.get(booking.host_id) ?? null,
          confirmation_deadline: booking.confirmation_deadline ?? null,
        }),
        sendAutomatedBookingExpiredMessage({
          bookingId: booking.id,
          listingId: booking.listing_id,
          guestId: booking.guest_id,
          hostId: booking.host_id,
          hostName: host?.full_name?.split(" ")[0] ?? "your host",
        }),
      ])
    }
  }

  const BOOKING_SELECT_CANDIDATES = [
    "id, guest_id, host_id, listing_id, session_date, start_time, end_time, status, reminder_sent, review_submitted, review_requested_at, access_code, access_code_sent, access_code_sent_at, host_payout",
    "id, guest_id, host_id, listing_id, session_date, start_time, end_time, status, reminder_sent, review_submitted, review_requested_at, access_code, access_code_sent_at, host_payout",
    "id, guest_id, host_id, listing_id, session_date, start_time, end_time, status, reminder_sent, review_submitted, review_requested_at, access_code, host_payout",
  ] as const
  let rows: BookingRow[] = []
  let loadError: string | null = null
  for (const select of BOOKING_SELECT_CANDIDATES) {
    const attempt = await admin.from("bookings").select(select as string).in("status", ["confirmed", "completed"])
    if (!attempt.error) {
      rows = (attempt.data ?? []) as unknown as BookingRow[]
      loadError = null
      break
    }
    loadError = attempt.error.message
    if (!isMissingColumnError(attempt.error.message)) break
  }
  if (loadError) {
    return NextResponse.json({ error: loadError }, { status: 500 })
  }

  const bookings = rows
  if (!bookings.length) {
    return NextResponse.json({
      expiredRequestsCancelled,
      preArrivalSent: 0,
      markedCompleted: 0,
      payoutSent: 0,
      reviewRequestsSent: 0,
    })
  }

  const listingIds = Array.from(new Set(bookings.map((item) => item.listing_id).filter(Boolean))) as string[]
  const profileIds = Array.from(
    new Set(bookings.flatMap((item) => [item.guest_id, item.host_id]).filter(Boolean))
  ) as string[]

  const [{ data: listingsRaw }, { data: profilesRaw }, emailMap] = await Promise.all([
    listingIds.length
      ? admin
          .from("listings")
          .select(
            "id, title, access_type, access_instructions, onsite_contact_name, onsite_contact_phone, access_code_send_timing, location_address, city, state"
          )
          .in("id", listingIds)
      : Promise.resolve({ data: [] as ListingRow[] }),
    profileIds.length
      ? admin.from("profiles").select("id, full_name").in("id", profileIds)
      : Promise.resolve({ data: [] as ProfileRow[] }),
    getEmailMap(profileIds),
  ])

  const listingMap = new Map<string, ListingRow>()
  for (const row of (listingsRaw ?? []) as ListingRow[]) {
    listingMap.set(row.id, row)
  }

  const profileMap = new Map<string, ProfileRow>()
  for (const row of (profilesRaw ?? []) as ProfileRow[]) {
    profileMap.set(row.id, row)
  }

  let preArrivalSent = 0
  let accessDetailsSent = 0
  for (const booking of bookings) {
    if (booking.status !== "confirmed") continue
    const listing = booking.listing_id ? listingMap.get(booking.listing_id) : null
    if (!listing?.access_code_send_timing) continue
    const startsAt = parseSessionStart(booking)
    if (!startsAt) continue
    if (booking.access_code_sent_at || booking.access_code_sent) continue

    const diffHours = (startsAt.getTime() - now.getTime()) / (1000 * 60 * 60)
    const due =
      (listing.access_code_send_timing === "24h_before" && diffHours <= 25 && diffHours >= 24) ||
      (listing.access_code_send_timing === "1h_before" && diffHours <= 2 && diffHours >= 1)
    if (!due) continue

    const guest = profileMap.get(booking.guest_id)
    const host = profileMap.get(booking.host_id)
    const guestEmail = emailMap.get(booking.guest_id) ?? null
    const hostEmail = emailMap.get(booking.host_id) ?? null
    const accessType = normalizeAccessType(listing.access_type)
    const isCodeBased = accessType === "code" || accessType === "lockbox"
    const startTimeLabel = formatTimeLabel(booking.session_date, booking.start_time)
    const endTimeLabel = formatTimeLabel(booking.session_date, booking.end_time)
    const address = [listing.location_address, listing.city, listing.state]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(", ")

    if (isCodeBased) {
      const sent = await sendAccessCode(booking.id)
      if (!sent.sent) continue
    } else if (accessType === "host_onsite") {
      const hostReminder = await sendHostOnsiteReminder({
        bookingId: booking.id,
        hostId: booking.host_id,
        hostEmail,
        hostName: host?.full_name ?? null,
        listingTitle: listing.title ?? "Your listing",
        guestName: guest?.full_name ?? "Guest",
        startTimeLabel,
        accessInstructions: listing.access_instructions,
      })
      const guestReminder = await sendGuestOnsiteReminder({
        guestId: booking.guest_id,
        to: guestEmail,
        guestName: guest?.full_name ?? "there",
        listingTitle: listing.title ?? "your session",
        address: address || "Address available in your booking details",
        accessInstructions: listing.access_instructions,
        onsiteContactName: listing.onsite_contact_name,
        onsiteContactPhone: listing.onsite_contact_phone,
        startTimeLabel,
        endTimeLabel,
        bookingId: booking.id,
      })
      if (!hostReminder.sent && !guestReminder.sent) continue
    } else {
      const sent = await sendGuestEntryInstructionsEmail({
        guestId: booking.guest_id,
        to: guestEmail,
        guestName: guest?.full_name ?? "there",
        listingTitle: listing.title ?? "your session",
        address: address || "Address available in your booking details",
        accessInstructions: listing.access_instructions || "Your host will provide entry details.",
        startTimeLabel,
        endTimeLabel,
        bookingId: booking.id,
      })
      if (!sent.sent) continue
    }

    const updateSent = await admin
      .from("bookings")
      .update({
        access_code_sent: true,
        access_code_sent_at: new Date().toISOString(),
      })
      .eq("id", booking.id)
    if (updateSent.error) {
      const fallbackUpdate = await admin
        .from("bookings")
        .update({
          access_code_sent_at: new Date().toISOString(),
        })
        .eq("id", booking.id)
      if (fallbackUpdate.error && !isMissingColumnError(fallbackUpdate.error.message)) continue
    }
    accessDetailsSent += 1
  }

  for (const booking of bookings) {
    if (booking.status !== "confirmed") continue
    if (booking.reminder_sent) continue
    if (booking.session_date !== tomorrowIsoDate) continue

    const guestEmail = emailMap.get(booking.guest_id) ?? null
    const listing = booking.listing_id ? listingMap.get(booking.listing_id) : null
    if (!listing || !guestEmail) continue

    const guestProfile = profileMap.get(booking.guest_id)
    const hostProfile = profileMap.get(booking.host_id)

    const result = await sendPreArrivalReminderEmail({
      guestId: booking.guest_id,
      guestEmail,
      guestFirstName: guestProfile?.full_name ?? null,
      hostFirstName: hostProfile?.full_name ?? null,
      listingTitle: listing.title ?? "Your session",
      sessionDate: booking.session_date,
      startTime: booking.start_time,
      endTime: booking.end_time,
      accessType: listing.access_type ?? null,
      accessCode: booking.access_code ?? null,
      entryInstructions: listing.access_instructions ?? null,
      bookingId: booking.id,
    })

    if (result?.sent) {
      await admin.from("bookings").update({ reminder_sent: true }).eq("id", booking.id)
      preArrivalSent += 1
    }
  }

  let markedCompleted = 0
  let payoutSent = 0
  for (const booking of bookings) {
    if (booking.status !== "confirmed") continue
    const endsAt = parseSessionEnd(booking)
    if (!endsAt || endsAt.getTime() > twoHoursAgo.getTime()) continue

    const { data: updated } = await admin
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", booking.id)
      .eq("status", "confirmed")
      .select("id")
      .maybeSingle()

    if (!updated?.id) continue
    markedCompleted += 1

    const hostEmail = emailMap.get(booking.host_id) ?? null
    const listing = booking.listing_id ? listingMap.get(booking.listing_id) : null
    if (!hostEmail || !listing) continue

    const hostProfile = profileMap.get(booking.host_id)
    const guestProfile = profileMap.get(booking.guest_id)

    const payoutResult = await sendHostPayoutSentEmail({
      hostId: booking.host_id,
      hostEmail,
      hostFirstName: hostProfile?.full_name ?? null,
      listingTitle: listing.title ?? "Your listing",
      sessionDate: booking.session_date,
      guestFullName: guestProfile?.full_name ?? null,
      hostPayout: Number(booking.host_payout ?? 0),
    })
    if (payoutResult?.sent) payoutSent += 1
  }

  const { data: reviewCandidatesRaw, error: reviewError } = await admin
    .from("bookings")
    .select("id, guest_id, host_id, listing_id, session_date, start_time, end_time, review_submitted, review_requested_at")
    .eq("status", "completed")
    .eq("review_submitted", false)
    .is("review_requested_at", null)

  if (reviewError) {
    return NextResponse.json({ error: reviewError.message }, { status: 500 })
  }

  let reviewRequestsSent = 0
  for (const booking of (reviewCandidatesRaw ?? []) as BookingRow[]) {
    const endsAt = parseSessionEnd(booking)
    if (!endsAt || endsAt.getTime() > twoHoursAgo.getTime()) continue

    const guestEmail = emailMap.get(booking.guest_id) ?? null
    const listing = booking.listing_id ? listingMap.get(booking.listing_id) : null
    if (!guestEmail || !listing) continue

    const guestProfile = profileMap.get(booking.guest_id)
    const result = await sendPostSessionReviewRequestEmail({
      guestId: booking.guest_id,
      guestEmail,
      guestFirstName: guestProfile?.full_name ?? null,
      listingTitle: listing.title ?? "your session",
      bookingId: booking.id,
    })

    if (result?.sent) {
      await admin.from("bookings").update({ review_requested_at: new Date().toISOString() }).eq("id", booking.id)
      reviewRequestsSent += 1
    }
  }

  return NextResponse.json({
    expiredRequestsCancelled,
    accessDetailsSent,
    preArrivalSent,
    markedCompleted,
    payoutSent,
    reviewRequestsSent,
  })
}
