import { NextRequest, NextResponse } from "next/server"

import { sanitizeText } from "@/lib/sanitize"
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
  if (typeof updatePayload.title === "string") {
    updatePayload.title = sanitizeText(updatePayload.title)
  }
  if (typeof updatePayload.description === "string") {
    updatePayload.description = sanitizeText(updatePayload.description)
  }
  if (typeof updatePayload.access_type === "string") {
    const normalized = updatePayload.access_type.trim().toLowerCase()
    if (normalized === "keypick" || normalized === "host_present") {
      updatePayload.access_type = "host_onsite"
    } else if (normalized === "smart_lock") {
      updatePayload.access_type = "code"
    } else if (["code", "lockbox", "host_onsite", "other"].includes(normalized)) {
      updatePayload.access_type = normalized
    } else {
      delete updatePayload.access_type
    }
  }
  if (typeof updatePayload.access_code_template === "string") {
    updatePayload.access_code_template = sanitizeText(updatePayload.access_code_template).slice(0, 20)
  }
  if (typeof updatePayload.access_code === "string") {
    updatePayload.access_code = sanitizeText(updatePayload.access_code).slice(0, 20)
  }
  if (typeof updatePayload.access_instructions === "string") {
    updatePayload.access_instructions = sanitizeText(updatePayload.access_instructions).slice(0, 500)
  }
  if (typeof updatePayload.onsite_contact_name === "string") {
    updatePayload.onsite_contact_name = sanitizeText(updatePayload.onsite_contact_name).slice(0, 120)
  }
  if (typeof updatePayload.onsite_contact_phone === "string") {
    updatePayload.onsite_contact_phone = sanitizeText(updatePayload.onsite_contact_phone).slice(0, 40)
  }
  if (Array.isArray(updatePayload.house_rules)) {
    updatePayload.house_rules = updatePayload.house_rules
      .filter((rule): rule is string => typeof rule === "string")
      .map((rule) => sanitizeText(rule))
      .filter((rule) => Boolean(rule))
  }
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
