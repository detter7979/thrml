import { NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

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

  const body = (await req.json().catch(() => ({}))) as { deactivateOriginal?: boolean }

  const { data: listing, error } = await supabase
    .from("listings")
    .select("id, host_id, parent_listing_id")
    .eq("id", id)
    .eq("host_id", user.id)
    .single()

  if (error || !listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 })
  }

  const publishPayload: Record<string, unknown> = {
    is_draft: false,
    is_active: true,
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { error: publishError } = await supabase
      .from("listings")
      .update(publishPayload)
      .eq("id", listing.id)
      .eq("host_id", user.id)
    if (!publishError) break
    const message = publishError.message ?? ""
    const missingColumnMatch = message.match(/'([^']+)' column/i)
    const missingColumn = missingColumnMatch?.[1]
    if (!missingColumn || !(missingColumn in publishPayload)) {
      return NextResponse.json({ error: message || "Unable to publish listing" }, { status: 500 })
    }
    delete publishPayload[missingColumn]
  }

  if (body.deactivateOriginal && typeof listing.parent_listing_id === "string") {
    const deactivatePayload: Record<string, unknown> = {
      is_active: false,
      deactivated_at: new Date().toISOString(),
      deactivated_reason: "superseded_by_new_version",
    }

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { error: deactivateError } = await supabase
        .from("listings")
        .update(deactivatePayload)
        .eq("id", listing.parent_listing_id)
        .eq("host_id", user.id)
      if (!deactivateError) break

      const message = deactivateError.message ?? ""
      const missingColumnMatch = message.match(/'([^']+)' column/i)
      const missingColumn = missingColumnMatch?.[1]
      if (!missingColumn || !(missingColumn in deactivatePayload)) {
        return NextResponse.json(
          { error: message || "Published, but failed to deactivate original listing" },
          { status: 500 }
        )
      }
      delete deactivatePayload[missingColumn]
    }
  }

  return NextResponse.json({ success: true })
}
