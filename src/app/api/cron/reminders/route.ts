import { NextRequest, NextResponse } from "next/server"

import {
  sendGuest24HourReminder,
  sendGuestEntryInstructionsEmail,
  sendGuestOnsiteReminder,
  sendHost24HourReminder,
  sendHostOnsiteReminder,
} from "@/lib/emails"
import { sendPostSessionEmails } from "@/lib/emails/post-session"
import { sendAccessCode } from "@/lib/access/send-access-code"
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
  access_code_sent: boolean | null
  access_code_sent_at: string | null
  reminder_24h_sent: boolean | null
  post_session_email_sent: boolean | null
  host_payout: number | null
}

type ListingRow = {
  id: string
  title: string | null
  access_type: string | null
  access_instructions: string | null
  onsite_contact_name: string | null
  onsite_contact_phone: string | null
  location_address?: string | null
  city?: string | null
  state?: string | null
  service_type?: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
}

function parseSessionStart(booking: Pick<BookingRow, "session_date" | "start_time">) {
  if (!booking.session_date || !booking.start_time) return null
  const parsed = new Date(`${booking.session_date}T${booking.start_time}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parseSessionEnd(booking: Pick<BookingRow, "session_date" | "end_time" | "start_time">) {
  if (!booking.session_date) return null
  const endTime = booking.end_time || booking.start_time || "23:59"
  const parsed = new Date(`${booking.session_date}T${endTime}`)
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

export async function GET(request: NextRequest) {
  const supplied =
    request.headers.get("x-cron-secret") ??
    request.headers.get("cron_secret") ??
    request.headers.get("authorization")?.replace("Bearer ", "")
  if (!process.env.CRON_SECRET || supplied !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000)
  const in1h30 = new Date(now.getTime() + 1.5 * 60 * 60 * 1000)
  const in24hCode = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const { data: bookingsRaw, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id, guest_id, host_id, listing_id, session_date, start_time, end_time, status, access_code_sent, access_code_sent_at, reminder_24h_sent, post_session_email_sent, host_payout"
    )
    .eq("status", "confirmed")

  if (bookingError) {
    return NextResponse.json({ error: bookingError.message }, { status: 500 })
  }

  const bookings = (bookingsRaw ?? []) as BookingRow[]
  if (!bookings.length) {
    return NextResponse.json({
      ok: true,
      processed: { reminders_24h: 0, access_codes: 0, post_session: 0 },
    })
  }

  const listingIds = Array.from(new Set(bookings.map((item) => item.listing_id).filter(Boolean))) as string[]
  const profileIds = Array.from(new Set(bookings.flatMap((item) => [item.guest_id, item.host_id]))) as string[]
  const [{ data: listingsRaw }, { data: profilesRaw }, emailMap] = await Promise.all([
    listingIds.length
      ? supabase
          .from("listings")
          .select("id, title, service_type, access_type, access_instructions, onsite_contact_name, onsite_contact_phone, location_address, city, state")
          .in("id", listingIds)
      : Promise.resolve({ data: [] as ListingRow[] }),
    profileIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", profileIds)
      : Promise.resolve({ data: [] as ProfileRow[] }),
    getEmailMap(profileIds),
  ])

  const listingMap = new Map<string, ListingRow>((listingsRaw ?? []).map((row) => [row.id, row as ListingRow]))
  const profileMap = new Map<string, ProfileRow>((profilesRaw ?? []).map((row) => [row.id, row as ProfileRow]))

  let reminders24h = 0
  for (const booking of bookings) {
    if (booking.reminder_24h_sent) continue
    const startsAt = parseSessionStart(booking)
    if (!startsAt || startsAt < in24h || startsAt > in25h) continue

    const listing = booking.listing_id ? listingMap.get(booking.listing_id) : null
    const guestEmail = emailMap.get(booking.guest_id) ?? null
    const hostEmail = emailMap.get(booking.host_id) ?? null
    if (!listing || !guestEmail || !hostEmail) continue

    try {
      await Promise.all([
        sendGuest24HourReminder({
          guestId: booking.guest_id,
          guestEmail,
          listingTitle: listing.title ?? "Your session",
          sessionDate: booking.session_date,
          startTime: booking.start_time,
          endTime: booking.end_time,
          accessType: listing.access_type ?? null,
          bookingId: booking.id,
        }),
        sendHost24HourReminder({
          hostId: booking.host_id,
          hostEmail,
          guestName: profileMap.get(booking.guest_id)?.full_name ?? "Guest",
          listingTitle: listing.title ?? "Your listing",
          sessionDate: booking.session_date,
          startTime: booking.start_time,
          endTime: booking.end_time,
          accessType: listing.access_type ?? null,
          bookingId: booking.id,
        }),
      ])

      await supabase
        .from("bookings")
        .update({ reminder_24h_sent: true, reminder_24h_sent_at: now.toISOString() })
        .eq("id", booking.id)
      reminders24h += 1
    } catch (error) {
      console.error(`[cron/reminders] 24h reminder failed for ${booking.id}`, error)
    }
  }

  let accessCodes = 0
  for (const booking of bookings) {
    if (booking.access_code_sent || booking.access_code_sent_at) continue
    const startsAt = parseSessionStart(booking)
    if (!startsAt || startsAt < in1h30 || startsAt > in24hCode) continue

    const listing = booking.listing_id ? listingMap.get(booking.listing_id) : null
    if (!listing) continue
    const guestEmail = emailMap.get(booking.guest_id) ?? null
    const hostEmail = emailMap.get(booking.host_id) ?? null
    const guestName = profileMap.get(booking.guest_id)?.full_name ?? "there"
    const hostName = profileMap.get(booking.host_id)?.full_name ?? null

    const accessType = normalizeAccessType(listing.access_type)
    const isCodeBased = accessType === "code" || accessType === "lockbox"
    const startTimeLabel = formatTimeLabel(booking.session_date, booking.start_time)
    const endTimeLabel = formatTimeLabel(booking.session_date, booking.end_time)
    const address = [listing.location_address, listing.city, listing.state]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(", ")

    try {
      if (isCodeBased) {
        const sent = await sendAccessCode(booking.id)
        if (!sent.sent) continue
      } else if (accessType === "host_onsite") {
        await Promise.all([
          sendHostOnsiteReminder({
            bookingId: booking.id,
            hostId: booking.host_id,
            hostEmail,
            hostName,
            listingTitle: listing.title ?? "Your listing",
            guestName: guestName || "Guest",
            startTimeLabel,
            accessInstructions: listing.access_instructions,
          }),
          sendGuestOnsiteReminder({
            guestId: booking.guest_id,
            to: guestEmail,
            guestName: guestName || "there",
            listingTitle: listing.title ?? "your session",
            address: address || "Address available in your booking details",
            accessInstructions: listing.access_instructions,
            onsiteContactName: listing.onsite_contact_name,
            onsiteContactPhone: listing.onsite_contact_phone,
            startTimeLabel,
            endTimeLabel,
            bookingId: booking.id,
          }),
        ])
      } else {
        await sendGuestEntryInstructionsEmail({
          guestId: booking.guest_id,
          to: guestEmail,
          guestName: guestName || "there",
          listingTitle: listing.title ?? "your session",
          address: address || "Address available in your booking details",
          accessInstructions: listing.access_instructions || "Your host will provide entry details.",
          startTimeLabel,
          endTimeLabel,
          bookingId: booking.id,
        })
      }

      await supabase
        .from("bookings")
        .update({ access_code_sent: true, access_code_sent_at: now.toISOString() })
        .eq("id", booking.id)
      accessCodes += 1
    } catch (error) {
      console.error(`[cron/reminders] access send failed for ${booking.id}`, error)
    }
  }

  let postSession = 0
  for (const booking of bookings) {
    if (booking.post_session_email_sent) continue
    const endsAt = parseSessionEnd(booking)
    if (!endsAt || endsAt < yesterday || endsAt > now) continue

    const listing = booking.listing_id ? listingMap.get(booking.listing_id) : null
    if (!listing) continue

    const result = await sendPostSessionEmails({
      id: booking.id,
      guest_id: booking.guest_id,
      host_id: booking.host_id,
      host_payout: booking.host_payout,
      post_session_email_sent: booking.post_session_email_sent,
      listings: {
        id: listing.id,
        title: listing.title,
        service_type: listing.service_type ?? null,
      },
      guest_profile: {
        full_name: profileMap.get(booking.guest_id)?.full_name ?? null,
        email: emailMap.get(booking.guest_id) ?? null,
      },
      host_profile: {
        full_name: profileMap.get(booking.host_id)?.full_name ?? null,
        email: emailMap.get(booking.host_id) ?? null,
      },
    })
    if (result.sent) postSession += 1
  }

  return NextResponse.json({
    ok: true,
    processed: {
      reminders_24h: reminders24h,
      access_codes: accessCodes,
      post_session: postSession,
    },
  })
}
