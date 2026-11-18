import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { logAdminAction } from "@/lib/admin-audit"
import { requireAdminApi } from "@/lib/admin-guard"
import { APPLICATION_STATUSES } from "@/lib/host/host-applications"

const payloadSchema = z
  .object({
    status: z.enum(APPLICATION_STATUSES).optional(),
    admin_note: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.status !== undefined || v.admin_note !== undefined, "Nothing to update")

/** PATCH /api/admin/host-applications/:id — move an application through review or add a note. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, admin, user } = await requireAdminApi()
  if (error || !admin || !user) return error

  const parsed = payloadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })

  const { error: updateError } = await admin
    .from("host_applications")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await logAdminAction(admin, {
    adminId: user.id,
    action: "host_application_update",
    targetType: "host_application",
    targetId: id,
    details: parsed.data,
  })
  return NextResponse.json({ success: true })
}
