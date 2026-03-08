import { NextRequest, NextResponse } from "next/server"

import { sendPostSessionReviewRequestEmail } from "@/lib/emails"
import { createAdminClient } from "@/lib/supabase/admin"

type BookingRow = {
  id: string
  guest_id: string
  listing_id: string | null
  session_date: string | null
  start_time: string | null
  end_time: string | null
  duration_hours: number | null
  guest_count: number | null
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

  const { data, error } = await supabase
    .from("bookings")
    .select("id, guest_id, listing_id, session_date, start_time, end_time, duration_hours, guest_count")
    .eq("status", "confirmed")
    .lte("session_date", todayIso)
    .is("review_requested_at", null)
    .eq("review_submitted", false)

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

  const [{ data: listings }, { data: guests }] = await Promise.all([
    listingIds.length
      ? supabase.from("listings").select("id, title, service_type").in("id", listingIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    guestIds.length
      ? supabase.from("profiles").select("id, full_name, email, auth_email").in("id", guestIds)
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

  let emailed = 0

  for (const booking of candidates) {
    const listing = booking.listing_id ? listingMap.get(booking.listing_id) : null
    const guest = guestMap.get(booking.guest_id)
    if (!listing || !guest?.email || !booking.session_date) continue

    await supabase
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", booking.id)
      .eq("status", "confirmed")

    try {
      await sendPostSessionReviewRequestEmail({
        guestId: booking.guest_id,
        guestEmail: guest.email,
        guestFirstName: firstName(guest.full_name),
        listingTitle: listing.title,
        bookingId: booking.id,
      })

      await supabase.from("bookings").update({ review_requested_at: new Date().toISOString() }).eq("id", booking.id)
      emailed += 1
    } catch {
      // Keep the booking completed even if email delivery fails this run.
    }
  }

  return NextResponse.json({ processed: candidates.length, emailed })
}
