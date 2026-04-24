import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAdminApi } from "@/lib/admin-guard"

const querySchema = z.object({
  userId: z.string().uuid(),
})

export async function GET(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const parsed = querySchema.safeParse({
    userId: req.nextUrl.searchParams.get("userId"),
  })
  if (!parsed.success) {
    return NextResponse.json({ error: "userId (uuid) required" }, { status: 400 })
  }

  const { userId } = parsed.data

  const [{ data: ledger, error: lErr }, { data: credits }] = await Promise.all([
    admin
      .from("credit_ledger")
      .select("id, user_id, amount, type, description, stripe_invoice_id, booking_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
    admin.from("user_credits").select("balance, currency, updated_at").eq("user_id", userId).maybeSingle(),
  ])

  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })

  return NextResponse.json({
    balanceCents: Number(credits?.balance ?? 0),
    currency: credits?.currency ?? "usd",
    updatedAt: credits?.updated_at ?? null,
    ledger: ledger ?? [],
  })
}
