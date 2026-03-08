import { NextRequest, NextResponse } from "next/server"

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
  req: NextRequest,
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
      { error: "Listing has upcoming bookings and cannot be edited." },
      { status: 409 }
    )
  }

  const payload = (await req.json()) as Record<string, unknown>
  const updatePayload: Record<string, unknown> = { ...payload }
  if (typeof updatePayload.min_duration_override_minutes === "number") {
    updatePayload.min_duration_override_minutes = Math.max(
      30,
      Number(updatePayload.min_duration_override_minutes)
    )
  }
  if (typeof updatePayload.fixed_session_minutes === "number") {
    updatePayload.fixed_session_minutes = Math.max(30, Number(updatePayload.fixed_session_minutes))
  }
  delete updatePayload.id
  delete updatePayload.host_id
  delete updatePayload.created_at
  delete updatePayload.updated_at

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase
      .from("listings")
      .update(updatePayload)
      .eq("id", id)
      .eq("host_id", user.id)
      .select("*")
      .single()

    if (!error) return NextResponse.json({ listing: data })

    const message = error.message ?? ""
    const missingColumnMatch = message.match(/'([^']+)' column/i)
    const missingColumn = missingColumnMatch?.[1]
    if (!missingColumn || !(missingColumn in updatePayload)) {
      return NextResponse.json({ error: message || "Unable to update listing" }, { status: 500 })
    }
    delete updatePayload[missingColumn]
  }

  return NextResponse.json({ error: "Unable to update listing" }, { status: 500 })
}
