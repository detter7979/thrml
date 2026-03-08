import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; date: string }> }
) {
  const { id, date } = await params
  if (!isIsoDate(date)) {
    return NextResponse.json({ error: "Invalid date format." }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: listing } = await supabase
    .from("listings")
    .select("id, host_id")
    .eq("id", id)
    .maybeSingle()

  if (!listing || listing.host_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: confirmedBooking } = await supabase
    .from("bookings")
    .select("id")
    .eq("listing_id", id)
    .eq("session_date", date)
    .eq("status", "confirmed")
    .limit(1)
    .maybeSingle()

  if (confirmedBooking?.id) {
    return NextResponse.json(
      {
        error: `You have an existing booking on ${date}. Cancel or reschedule it before blocking this date.`,
      },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from("listing_blackout_dates")
    .delete()
    .eq("listing_id", id)
    .eq("blackout_date", date)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
