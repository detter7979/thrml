import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

async function getActiveBookingCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listingId: string
) {
  const today = new Date().toISOString().slice(0, 10)
  const nowTime = new Date().toTimeString().slice(0, 5)
  const fallback = await supabase
    .from("bookings")
    .select("id, session_date, end_time")
    .eq("listing_id", listingId)
    .in("status", ["pending_host", "pending", "confirmed"])
    .gte("session_date", today)

  if (fallback.error || !fallback.data) return 0

  return fallback.data.filter((booking) => {
    if (booking.session_date > today) return true
    if (booking.session_date < today) return false
    const endTime = typeof booking.end_time === "string" && booking.end_time ? booking.end_time : "23:59"
    return endTime >= nowTime
  }).length
}

export async function PATCH(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const activeBookingCount = await getActiveBookingCount(supabase, id)
  if (activeBookingCount > 0) {
    return NextResponse.json(
      { error: "Cannot deactivate listing with active bookings" },
      { status: 409 }
    )
  }

  const updatePayload: Record<string, unknown> = {
    is_active: false,
    deactivated_at: new Date().toISOString(),
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { error } = await supabase
      .from("listings")
      .update(updatePayload)
      .eq("id", id)
      .eq("host_id", user.id)
    if (!error) return NextResponse.json({ success: true })

    const message = error.message ?? ""
    const missingColumnMatch = message.match(/'([^']+)' column/i)
    const missingColumn = missingColumnMatch?.[1]
    if (!missingColumn || !(missingColumn in updatePayload)) {
      return NextResponse.json({ error: message || "Unable to deactivate listing" }, { status: 500 })
    }
    delete updatePayload[missingColumn]
  }

  return NextResponse.json({ error: "Unable to deactivate listing" }, { status: 500 })
}
