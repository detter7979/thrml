import { NextResponse } from "next/server"
import { z } from "zod"

import { logAdminAction } from "@/lib/admin-audit"
import { requireAdminApi } from "@/lib/admin-guard"

const schema = z.object({
  status: z.enum(["open", "actioned", "dismissed"]),
  note: z.string().max(1000).optional(),
  /** Optional one-click fix applied with the status change. */
  action: z.enum(["hide_review", "deactivate_listing"]).optional(),
})

/** Resolve a content report, optionally hiding the review or deactivating the listing. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, admin, user } = await requireAdminApi()
  if (error || !admin || !user) return error

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 })
  const { status, note, action } = parsed.data

  const { data: report } = await admin
    .from("content_reports")
    .select("id, target_type, target_id")
    .eq("id", id)
    .maybeSingle()
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 })

  if (action === "hide_review") {
    if (report.target_type !== "review") return NextResponse.json({ error: "Not a review" }, { status: 400 })
    const { error: hideError } = await admin
      .from("reviews")
      .update({ is_published: false, flagged: true, flagged_reason: `Report ${id}` })
      .eq("id", report.target_id)
    if (hideError) return NextResponse.json({ error: hideError.message }, { status: 500 })
  }
  if (action === "deactivate_listing") {
    if (report.target_type !== "listing") return NextResponse.json({ error: "Not a listing" }, { status: 400 })
    const { error: listingError } = await admin
      .from("listings")
      .update({ is_active: false, deactivated_at: new Date().toISOString(), deactivated_reason: "reported" })
      .eq("id", report.target_id)
    if (listingError) return NextResponse.json({ error: listingError.message }, { status: 500 })
  }

  const resolved = status !== "open"
  const { error: updateError } = await admin
    .from("content_reports")
    .update({
      status,
      admin_note: note?.trim() || null,
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? user.id : null,
    })
    .eq("id", id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await logAdminAction(admin, {
    adminId: user.id,
    action: "report_resolve",
    targetType: "content_report",
    targetId: id,
    details: { status, action: action ?? null },
  })

  return NextResponse.json({ ok: true })
}
