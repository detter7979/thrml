import { NextResponse } from "next/server"

import { getOrCreateReferralCode } from "@/lib/referral"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()
  const [code, referralsResult, earningsResult, profileResult, userCreditsResult] = await Promise.all([
    getOrCreateReferralCode(user.id),
    admin
      .from("referrals")
      .select("id, status, created_at, converted_at, referred_user_id")
      .eq("referrer_id", user.id),
    admin
      .from("referral_earnings")
      .select("id, amount_cents, status, created_at, booking_id, referral_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    admin.from("profiles").select("referral_credit_cents").eq("id", user.id).maybeSingle(),
    admin.from("user_credits").select("balance").eq("user_id", user.id).maybeSingle(),
  ])

  const referrals = referralsResult.data ?? []
  const earnings = earningsResult.data ?? []

  const bookingIds = [
    ...new Set(
      earnings
        .map((e) => e.booking_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ]

  let bookingById: Record<string, { total_charged: number | null; guest_id: string | null }> = {}
  if (bookingIds.length) {
    const { data: bookingRows } = await admin
      .from("bookings")
      .select("id, total_charged, guest_id")
      .in("id", bookingIds)
    bookingById = Object.fromEntries(
      (bookingRows ?? []).map((b) => [
        String(b.id),
        { total_charged: b.total_charged != null ? Number(b.total_charged) : null, guest_id: b.guest_id ?? null },
      ])
    )
  }

  const guestIds = [
    ...new Set(
      Object.values(bookingById)
        .map((b) => b.guest_id)
        .filter((id): id is string => Boolean(id))
    ),
  ]

  let firstNameByUserId: Record<string, string | null> = {}
  if (guestIds.length) {
    const { data: profileRows } = await admin
      .from("profiles")
      .select("id, first_name, full_name")
      .in("id", guestIds)
    firstNameByUserId = Object.fromEntries(
      (profileRows ?? []).map((p) => {
        const first =
          typeof p.first_name === "string" && p.first_name.trim()
            ? p.first_name.trim().split(/\s+/)[0] ?? null
            : typeof p.full_name === "string" && p.full_name.trim()
              ? p.full_name.trim().split(/\s+/)[0] ?? null
              : null
        return [String(p.id), first]
      })
    )
  }

  const earningsDetailed = earnings.map((row) => {
    const booking = row.booking_id ? bookingById[String(row.booking_id)] : undefined
    const guestId = booking?.guest_id ?? null
    const referredFirstName = guestId ? firstNameByUserId[String(guestId)] ?? null : null
    return {
      ...row,
      referredFirstName,
      bookingTotalCents:
        booking?.total_charged != null ? Math.round(Number(booking.total_charged) * 100) : null,
    }
  })

  const totalEarnedCents = earnings
    .filter((e) => e.status === "available" || e.status === "applied")
    .reduce((sum, e) => sum + Number(e.amount_cents ?? 0), 0)

  return NextResponse.json({
    code,
    referralLink: `https://usethrml.com?ref=${encodeURIComponent(code)}`,
    totalReferrals: referrals.length,
    convertedReferrals: referrals.filter((r) => r.status === "converted").length,
    totalEarnedCents,
    walletBalanceCents:
      Number(profileResult.data?.referral_credit_cents ?? 0) +
      Number(userCreditsResult.data?.balance ?? 0),
    earnings: earningsDetailed,
  })
}
