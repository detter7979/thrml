import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAdminApi } from "@/lib/admin-guard"

const payloadSchema = z.object({
  is_active: z.boolean(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const parsed = payloadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })

  const { error: updateError } = await admin
    .from("listings")
    .update({
      is_active: parsed.data.is_active,
      ...(parsed.data.is_active
        ? { deactivated_at: null, deactivated_reason: null }
        : { deactivated_at: new Date().toISOString() }),
    })
    .eq("id", id)
    .eq("is_deleted", false)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ success: true, is_active: parsed.data.is_active })
}
