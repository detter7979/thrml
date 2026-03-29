import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { generateReferralCode } from "@/lib/referral"
import { requireAdminApi } from "@/lib/admin-guard"

const postSchema = z.object({
  userId: z.string().uuid(),
  customSlug: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[A-Za-z0-9_]+$/, "Slug: letters, numbers, underscore only"),
  rewardOverrideCents: z.number().int().positive().nullable().optional(),
  notes: z.string().max(500).optional(),
})

export async function GET() {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const { data: codes, error: cErr } = await admin
    .from("referral_codes")
    .select("*")
    .order("created_at", { ascending: false })

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  const rows = codes ?? []
  const codeIds = rows.map((c) => c.id)
  const userIds = [...new Set(rows.map((c) => c.user_id))]

  const [{ data: referralRows }, { data: profiles }] = await Promise.all([
    codeIds.length
      ? admin.from("referrals").select("referral_code_id, status").in("referral_code_id", codeIds)
      : Promise.resolve({ data: [] as { referral_code_id: string; status: string }[] }),
    userIds.length
      ? admin.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])

  const profileById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))
  const convertedByCode = new Map<string, number>()
  for (const r of referralRows ?? []) {
    if (r.status === "converted") {
      convertedByCode.set(r.referral_code_id, (convertedByCode.get(r.referral_code_id) ?? 0) + 1)
    }
  }

  const paidByUser = new Map<string, number>()
  if (userIds.length) {
    const { data: earnRows } = await admin
      .from("referral_earnings")
      .select("user_id, amount_cents")
      .in("user_id", userIds)
      .eq("status", "paid_out")
    for (const e of earnRows ?? []) {
      const uid = String(e.user_id)
      paidByUser.set(uid, (paidByUser.get(uid) ?? 0) + Number(e.amount_cents ?? 0))
    }
  }

  return NextResponse.json({
    codes: rows.map((c) => ({
      ...c,
      profile: profileById[c.user_id as string] ?? null,
      convertedCount: convertedByCode.get(c.id as string) ?? 0,
      paidOutCents: paidByUser.get(c.user_id as string) ?? 0,
    })),
  })
}

export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 })
  }

  const { userId, customSlug, rewardOverrideCents, notes } = parsed.data
  const slugUpper = customSlug.toUpperCase()

  const { data: existingUser } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle()
  if (!existingUser?.id) {
    return NextResponse.json({ error: "User profile not found for this id" }, { status: 404 })
  }

  const { data: activeRows } = await admin
    .from("referral_codes")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)

  const existingId = activeRows?.[0]?.id as string | undefined

  if (existingId) {
    const { error: upErr } = await admin
      .from("referral_codes")
      .update({
        is_affiliate: true,
        custom_slug: slugUpper,
        reward_override_cents: rewardOverrideCents ?? null,
        notes: notes ?? null,
      })
      .eq("id", existingId)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: existingId, updated: true })
  }

  const code = generateReferralCode(userId)
  const { data: inserted, error: insErr } = await admin
    .from("referral_codes")
    .insert({
      user_id: userId,
      code,
      is_affiliate: true,
      custom_slug: slugUpper,
      reward_override_cents: rewardOverrideCents ?? null,
      notes: notes ?? null,
      is_active: true,
    })
    .select("id")
    .single()

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, id: inserted?.id, updated: false })
}
