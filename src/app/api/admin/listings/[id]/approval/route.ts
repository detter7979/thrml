import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { logAdminAction } from "@/lib/admin-audit"
import { requireAdminApi } from "@/lib/admin-guard"
import { sendHostListingDecisionEmail } from "@/lib/emails/host-applications"

const payloadSchema = z.object({
  action: z.enum(["approve", "approve_founding", "decline"]),
  note: z.string().trim().max(1000).optional(),
  notify: z.boolean().optional(),
})

/**
 * PATCH /api/admin/listings/:id/approval
 *  approve           → approved + live
 *  approve_founding  → approved + live + claim a founding-host spot for the host (respects the cap)
 *  decline           → declined + hidden
 * Emails the host unless notify === false.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, admin, user } = await requireAdminApi()
  if (error || !admin || !user) return error

  const parsed = payloadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  const { action, note } = parsed.data
  const approved = action !== "decline"

  const { data: listing, error: readError } = await admin
    .from("listings")
    .select("id, host_id, title, is_deleted")
    .eq("id", id)
    .maybeSingle()
  if (readError || !listing || listing.is_deleted) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 })
  }

  const now = new Date().toISOString()
  const { error: updateError } = await admin
    .from("listings")
    .update({
      approval_status: approved ? "approved" : "declined",
      approval_reviewed_at: now,
      approval_note: note ?? null,
      ...(approved
        ? { is_active: true, is_draft: false, deactivated_at: null, deactivated_reason: null }
        : { is_active: false, deactivated_at: now, deactivated_reason: "not_approved" }),
    })
    .eq("id", id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  let founding = false
  if (action === "approve_founding" && listing.host_id) {
    const { data: claimed, error: claimError } = await admin.rpc("claim_founding_host", { p_host: listing.host_id })
    if (claimError) console.error("[admin approval] claim_founding_host failed", claimError.message)
    founding = claimed === true
  }

  // Keep the application record in step (matched by the host's email).
  let hostEmail: string | null = null
  if (listing.host_id) {
    const { data: hostUser } = await admin.auth.admin.getUserById(listing.host_id)
    hostEmail = hostUser?.user?.email?.toLowerCase() ?? null
    if (hostEmail) {
      await admin
        .from("host_applications")
        .update({
          status: approved ? (founding ? "founding" : "converted") : "waitlisted",
          user_id: listing.host_id,
          updated_at: now,
        })
        .eq("email", hostEmail)
    }
  }

  if (parsed.data.notify !== false && hostEmail) {
    await sendHostListingDecisionEmail({
      to: hostEmail,
      userId: listing.host_id ?? null,
      listingId: id,
      title: typeof listing.title === "string" ? listing.title : null,
      approved,
      founding,
      note: note ?? null,
    }).catch((err) => console.error("[admin approval] host email failed", err))
  }

  await logAdminAction(admin, {
    adminId: user.id,
    action: "listing_approval",
    targetType: "listing",
    targetId: id,
    details: { action, founding, note: note ?? null },
  })

  return NextResponse.json({
    success: true,
    approval_status: approved ? "approved" : "declined",
    founding,
    foundingRequestedButFull: action === "approve_founding" && !founding,
  })
}
