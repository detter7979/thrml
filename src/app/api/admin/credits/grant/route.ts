import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAdminApi } from "@/lib/admin-guard"
import { sendCreditGrantedEmail } from "@/lib/emails/credit-granted"

const bodySchema = z.object({
  userId: z.string().uuid(),
  amountCents: z.number().int().positive().max(500_000_00),
  reason: z.string().trim().min(1).max(2000),
})

export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 })
  }

  const { userId, amountCents, reason } = parsed.data

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle()
  if (profileError || !profile) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 })
  }

  const { error: rpcError } = await admin.rpc("grant_user_credit", {
    p_user_id: userId,
    p_amount_cents: amountCents,
    p_description: reason,
  })
  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  const { data: credits } = await admin.from("user_credits").select("balance").eq("user_id", userId).maybeSingle()

  const { data: auth } = await admin.auth.admin.getUserById(userId)
  const email = auth.user?.email?.trim()
  if (email) {
    const emailResult = await sendCreditGrantedEmail({
      to: email,
      userId,
      amountCents,
      reason,
    })
    if (!emailResult.sent && emailResult.error) {
      console.error("[admin/credits/grant] credit email not sent", {
        userId,
        error: emailResult.error,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    balanceCents: Number(credits?.balance ?? 0),
  })
}
