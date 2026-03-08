import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: original, error: originalError } = await supabase
    .from("listings")
    .select("*")
    .eq("id", id)
    .eq("host_id", user.id)
    .single()

  if (originalError || !original) {
    return NextResponse.json({ error: "Original listing not found" }, { status: 404 })
  }

  const version = Number(original.version ?? 1)
  const clonePayload: Record<string, unknown> = {
    ...original,
    id: undefined,
    created_at: undefined,
    updated_at: undefined,
    deactivated_at: null,
    deactivated_reason: null,
    parent_listing_id: original.id,
    version: version + 1,
    is_draft: true,
    is_active: false,
  }
  delete clonePayload.id
  delete clonePayload.created_at
  delete clonePayload.updated_at

  let cloned: Record<string, unknown> | null = null
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await supabase.from("listings").insert(clonePayload).select("*").single()
    if (!error && data) {
      cloned = data
      break
    }
    const message = error?.message ?? ""
    const missingColumnMatch = message.match(/'([^']+)' column/i)
    const missingColumn = missingColumnMatch?.[1]
    if (!missingColumn || !(missingColumn in clonePayload)) {
      return NextResponse.json({ error: message || "Unable to clone listing" }, { status: 500 })
    }
    delete clonePayload[missingColumn]
  }

  if (!cloned || typeof cloned.id !== "string") {
    return NextResponse.json({ error: "Unable to clone listing" }, { status: 500 })
  }

  const { data: photos } = await supabase
    .from("listing_photos")
    .select("*")
    .eq("listing_id", id)
    .order("order_index", { ascending: true })

  if ((photos ?? []).length) {
    const photoRows = (photos ?? []).map((photo) => {
      const row = { ...(photo as Record<string, unknown>) }
      delete row.id
      delete row.created_at
      delete row.updated_at
      row.listing_id = cloned?.id
      return row
    })
    await supabase.from("listing_photos").insert(photoRows)
  }

  const availabilityRows = await supabase
    .from("listing_availability")
    .select("*")
    .eq("listing_id", id)

  if (!availabilityRows.error && (availabilityRows.data ?? []).length) {
    const rows = (availabilityRows.data ?? []).map((entry) => {
      const row = { ...(entry as Record<string, unknown>) }
      delete row.id
      delete row.created_at
      delete row.updated_at
      row.listing_id = cloned?.id
      return row
    })
    await supabase.from("listing_availability").insert(rows)
  }

  return NextResponse.json({
    listingId: cloned.id,
    originalTitle: typeof original.title === "string" ? original.title : "Original listing",
  })
}
