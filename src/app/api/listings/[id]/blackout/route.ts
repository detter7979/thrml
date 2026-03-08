import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const blackoutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().max(500).optional(),
})

function isFutureDate(date: string) {
  return date > new Date().toISOString().slice(0, 10)
}

async function getListingById(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listingId: string
) {
  return supabase
    .from("listings")
    .select("id, host_id, is_active")
    .eq("id", listingId)
    .maybeSingle()
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: listing } = await getListingById(supabase, id)
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isHost = Boolean(user?.id && user.id === listing.host_id)

  if (!listing.is_active && !isHost) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 })
  }

  const { data, error } = await supabase
    .from("listing_blackout_dates")
    .select("blackout_date, reason, created_at")
    .eq("listing_id", id)
    .order("blackout_date", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (isHost) return NextResponse.json({ blackoutDates: data ?? [] })
  return NextResponse.json({
    blackoutDates: (data ?? []).map((row) => ({
      blackout_date: row.blackout_date,
    })),
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = blackoutSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { date, reason } = parsed.data
  if (!isFutureDate(date)) {
    return NextResponse.json(
      { error: "Blackout date must be in the future." },
      { status: 400 }
    )
  }

  const { data: listing } = await getListingById(supabase, id)
  if (!listing || listing.host_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: existingBooking } = await supabase
    .from("bookings")
    .select("id")
    .eq("listing_id", id)
    .eq("session_date", date)
    .in("status", ["pending_host", "pending", "confirmed"])
    .limit(1)
    .maybeSingle()

  if (existingBooking?.id) {
    return NextResponse.json(
      {
        error: `You have an existing booking on ${date}. Cancel or reschedule it before blocking this date.`,
      },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("listing_blackout_dates")
    .insert({
      listing_id: id,
      blackout_date: date,
      reason: reason || null,
    })
    .select("blackout_date, reason, created_at")
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Date is already blocked." }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ blackoutDate: data }, { status: 201 })
}
