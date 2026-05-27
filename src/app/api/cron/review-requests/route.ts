import { NextRequest, NextResponse } from "next/server"

import { sendPostSessionReviewRequestEmail, sendHostGuestReviewRequestEmail } from "@/lib/emails"
import { createAdminClient } from "@/lib/supabase/admin"

type BookingRow = {
  id: string
  guest_id: string
  host_id: string
  listing_id: string | null
  session_date: string | null
  start_time: string | null
  end_time: string | null
  duration_hours: number | null
  guest_count: number | null
  post_session_email_sent?: boolean | null
  host_review_submitted?: boolean | null
  host_review_requested_at?: string | null
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

function parseSessionEnd(booking: BookingRow) {
  if (!booking.session_date) return null
  const endTime = booking.end_time || booking.start_time || "23:59"
  const date = new Date(`${booking.session_date}T${endTime}`)
  return Number.isNaN(date.getTime()) ? null : date
}

function firstName(value: string | null | undefined) {
  const normalized = (value ?? "").trim()
  if (!normalized) return "there"
  return normalized.split(" ")[0] ?? "there"
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

  const supabase = createAdminClient()
  const todayIso = new Date().toISOString().split("T")[0]

  const attempts = [
    () =>
      supabase
        .from("bookings")
        .select(
          "id, guest_id, host_id, listing_id, session_date, start_time, end_time, duration_hours, guest_count, post_session_email_sent, host_review_submitted, host_review_requested_at"
        )
        .eq("status", "confirmed")
        .lte("session_date", todayIso)
        .eq("post_session_email_sent", false),
    () =>
      supabase
        .from("bookings")
        .select(
          "id, guest_id, host_id, listing_id, session_date, start_time, end_time, duration_hours, guest_count, host_review_submitted, host_review_requested_at"
        )
        .eq("status", "confirmed")
        .lte("session_date", todayIso)
        .is("review_requested_at", null)
        .eq("review_submitted", false),
  ] as const

  let data: BookingRow[] | null = null
  let error: { message: string } | null = null
  for (const attempt of attempts) {
    const result = await attempt()
    if (!result.error) {
      data = (result.data ?? []) as BookingRow[]
      error = null
      break
    }
    error = result.error
    if (!isMissingColumnError(result.error.message)) break
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const now = Date.now()
  const candidates = ((data ?? []) as BookingRow[]).filter((booking) => {
    const endsAt = parseSessionEnd(booking)
    return Boolean(endsAt && endsAt.getTime() < now)
  })

  if (!candidates.length) {
    return NextResponse.json({ processed: 0, emailed: 0 })
  }

  const listingIds = Array.from(new Set(candidates.map((item) => item.listing_id).filter(Boolean))) as string[]
  const guestIds = Array.from(new Set(candidates.map((item) => item.guest_id).filter(Boolean))) as string[]
  const hostIds = Array.from(new Set(candidates.map((item) => item.host_id).filter(Boolean))) as string[]

  const [{ data: listings }, { data: guests }, { data: hosts }] = await Promise.all([
    listingIds.length
      ? supabase.from("listings").select("id, title, service_type").in("id", listingIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    guestIds.length
      ? supabase.from("profiles").select("id, full_name, email, auth_email").in("id", guestIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    hostIds.length
      ? supabase.from("profiles").select("id, full_name, email, auth_email").in("id", hostIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  const listingMap = new Map<string, { title: string; service_type: string }>()
  for (const row of (listings ?? []) as Record<string, unknown>[]) {
    const id = typeof row.id === "string" ? row.id : null
    if (!id) continue
    listingMap.set(id, {
      title: typeof row.title === "string" ? row.title : "Thrml session",
      service_type: typeof row.service_type === "string" ? row.service_type : "wellness session",
    })
  }

  const guestMap = new Map<string, { full_name: string; email: string | null }>()
  for (const row of (guests ?? []) as Record<string, unknown>[]) {
    const id = typeof row.id === "string" ? row.id : null
    if (!id) continue
    const authEmail = typeof row.auth_email === "string" ? row.auth_email : null
    const profileEmail = typeof row.email === "string" ? row.email : null
    guestMap.set(id, {
      full_name: typeof row.full_name === "string" ? row.full_name : "",
      email: authEmail ?? profileEmail,
    })
  }

  const hostMap = new Map<string, { full_name: string; email: string | null }>()
  for (const row of (hosts ?? []) as Record<string, unknown>[]) {
    const id = typeof row.id === "string" ? row.id : null
    if (!id) continue
    const authEmail = typeof row.auth_email === "string" ? row.auth_email : null
    const profileEmail = typeof row.email === "string" ? row.email : null
    hostMap.set(id, {
      full_name: typeof row.full_name === "string" ? row.full_name : "",
      email: authEmail ?? profileEmail,
    })
  }

  let emailed = 0
  let hostEmailed = 0

  for (const booking of candidates) {
    const listing = booking.listing_id ? listingMap.get(booking.listing_id) : null
    const guest = guestMap.get(booking.guest_id)
    const host = hostMap.get(booking.host_id)
    if (!listing || !booking.session_date) continue

    await supabase
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", booking.id)
      .eq("status", "confirmed")

    const bookingUpdates: Record<string, unknown> = {}

    if (guest?.email) {
      try {
        await sendPostSessionReviewRequestEmail({
          guestId: booking.guest_id,
          guestEmail: guest.email,
          guestFirstName: firstName(guest.full_name),
          listingTitle: listing.title,
          bookingId: booking.id,
        })
        bookingUpdates.review_requested_at = new Date().toISOString()
        bookingUpdates.post_session_email_sent = true
        emailed += 1
      } catch {
        // Keep the booking completed even if guest email delivery fails this run.
      }
    }

    if (
      host?.email &&
      !booking.host_review_submitted &&
      !booking.host_review_requested_at
    ) {
      try {
        await sendHostGuestReviewRequestEmail({
          hostId: booking.host_id,
          hostEmail: host.email,
          hostFirstName: firstName(host.full_name),
          guestFullName: guest?.full_name ?? null,
          listingTitle: listing.title,
          bookingId: booking.id,
        })
        bookingUpdates.host_review_requested_at = new Date().toISOString()
        hostEmailed += 1
      } catch {
        // Host rating prompt can retry on a later cron run.
      }
    }

    if (Object.keys(bookingUpdates).length) {
      await supabase.from("bookings").update(bookingUpdates).eq("id", booking.id)
    }
  }

  return NextResponse.json({ processed: candidates.length, emailed, hostEmailed })
}
