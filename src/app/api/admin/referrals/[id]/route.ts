import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAdminApi } from "@/lib/admin-guard"

const patchSchema = z.object({
  is_active: z.boolean(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 })
  }

  const { error: upErr } = await admin
    .from("referral_codes")
    .update({ is_active: parsed.data.is_active })
    .eq("id", id)

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
