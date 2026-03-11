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

  const selectCandidates = [
    "id, host_id, parent_listing_id, access_type, access_code, access_code_template",
    "id, host_id, parent_listing_id, access_type, access_code_template",
    "id, host_id, parent_listing_id, access_type, access_code",
    "id, host_id, parent_listing_id, access_type",
  ] as const
  let listing: Record<string, unknown> | null = null
  let error: { message?: string } | null = null
  for (const select of selectCandidates) {
    const attempt = await supabase
      .from("listings")
      .select(select)
      .eq("id", id)
      .eq("host_id", user.id)
      .maybeSingle()
    if (!attempt.error) {
      listing = attempt.data as Record<string, unknown> | null
      error = null
      break
    }
    error = attempt.error
    if (!attempt.error.message.toLowerCase().includes("column")) break
  }

  if (error || !listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 })
  }

  const accessTypeRaw =
    typeof (listing as Record<string, unknown>).access_type === "string"
      ? ((listing as Record<string, unknown>).access_type as string).trim().toLowerCase()
      : "code"
  const accessType =
    accessTypeRaw === "keypick" || accessTypeRaw === "host_present"
      ? "host_onsite"
      : accessTypeRaw === "smart_lock"
        ? "code"
        : accessTypeRaw
  const accessCode =
    typeof (listing as Record<string, unknown>).access_code === "string"
      ? ((listing as Record<string, unknown>).access_code as string)
      : typeof (listing as Record<string, unknown>).access_code_template === "string"
        ? ((listing as Record<string, unknown>).access_code_template as string)
        : ""
  const codeRequired = accessType === "code" || accessType === "lockbox"
  if (codeRequired && accessCode.trim() === "") {
    return NextResponse.json(
      {
        error: `An access code is required for ${
          accessType === "code" ? "code" : "lockbox"
        } entry. Add it in your listing settings before going live.`,
      },
      { status: 400 }
    )
  }
  const listingId = String((listing as Record<string, unknown>).id)
  const parentListingId =
    typeof (listing as Record<string, unknown>).parent_listing_id === "string"
      ? ((listing as Record<string, unknown>).parent_listing_id as string)
      : null

  const publishPayload: Record<string, unknown> = {
    is_draft: false,
    is_active: true,
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { error: publishError } = await supabase
      .from("listings")
      .update(publishPayload)
      .eq("id", listingId)
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

  if (body.deactivateOriginal && parentListingId) {
    const deactivatePayload: Record<string, unknown> = {
      is_active: false,
      deactivated_at: new Date().toISOString(),
      deactivated_reason: "superseded_by_new_version",
    }

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { error: deactivateError } = await supabase
        .from("listings")
        .update(deactivatePayload)
        .eq("id", parentListingId)
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
