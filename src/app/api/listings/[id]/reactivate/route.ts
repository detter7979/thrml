import { NextResponse } from "next/server"

import { normalizeApprovalStatus } from "@/lib/host/listing-approval"

import { assertHostInsuranceAttested } from "@/lib/host/insurance-attestation"
import { assertPublishableListingCopy } from "@/lib/listings/host-claim-policy"
import { createClient } from "@/lib/supabase/server"

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

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("title, description")
    .eq("id", id)
    .eq("host_id", user.id)
    .maybeSingle()

  if (listingError || !listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 })
  }

  // Unapproved listings can't go live (the DB trigger would silently keep them inactive).
  const { data: approvalRow } = await supabase
    .from("listings")
    .select("approval_status")
    .eq("id", id)
    .maybeSingle()
  const approval = normalizeApprovalStatus(approvalRow?.approval_status)
  if (approval !== "approved") {
    return NextResponse.json(
      {
        error:
          approval === "pending"
            ? "This listing is waiting for approval. We'll email you as soon as it's live."
            : "This listing wasn't approved for the current round. Reply to our email if you have questions.",
      },
      { status: 409 }
    )
  }

  const claimCheck = assertPublishableListingCopy({
    title: typeof listing.title === "string" ? listing.title : "",
    description: typeof listing.description === "string" ? listing.description : "",
  })
  if (!claimCheck.ok) {
    return NextResponse.json({ error: claimCheck.error }, { status: 400 })
  }

  const attestationCheck = await assertHostInsuranceAttested(supabase, user.id)
  if (!attestationCheck.ok) {
    return NextResponse.json({ error: attestationCheck.error }, { status: 400 })
  }

  const updatePayload: Record<string, unknown> = {
    is_active: true,
    deactivated_at: null,
    deactivated_reason: null,
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
      return NextResponse.json({ error: message || "Unable to reactivate listing" }, { status: 500 })
    }
    delete updatePayload[missingColumn]
  }

  return NextResponse.json({ error: "Unable to reactivate listing" }, { status: 500 })
}
