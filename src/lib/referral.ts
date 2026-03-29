import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Generate a unique 6-character referral code for a user.
 * Format: first 3 chars of user ID + 3 random alphanumeric chars.
 */
export function generateReferralCode(userId: string): string {
  const prefix = userId.replace(/-/g, "").substring(0, 3).toUpperCase()
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const suffix = Array.from({ length: 3 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("")
  return `${prefix}${suffix}`
}

function normalizeRefCode(value: string): string {
  return value.trim()
}

async function findActiveReferralCodeRow(admin: ReturnType<typeof createAdminClient>, refCode: string) {
  const normalized = normalizeRefCode(refCode)
  if (!normalized) return null

  const { data: byCode } = await admin
    .from("referral_codes")
    .select("id, user_id, is_active")
    .eq("code", normalized)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (byCode) return byCode

  const { data: bySlug } = await admin
    .from("referral_codes")
    .select("id, user_id, is_active")
    .eq("custom_slug", normalized)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  return bySlug ?? null
}

/**
 * Get or create a referral code for a user.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const admin = createAdminClient()

  const { data: existingRows } = await admin
    .from("referral_codes")
    .select("code, custom_slug")
    .eq("user_id", userId)
    .eq("is_active", true)

  const rows = existingRows ?? []
  const existing = rows.find((r) => r.custom_slug) ?? rows[0]
  if (existing) return existing.custom_slug ?? existing.code

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode(userId)
    const { data, error } = await admin
      .from("referral_codes")
      .insert({ user_id: userId, code })
      .select("code")
      .single()
    if (!error && data) return data.code
  }

  throw new Error("Failed to generate unique referral code")
}

/**
 * Record a referral when a new user signs up with a ref= param.
 * Called during signup flow. Silent on errors.
 */
export async function recordReferral(referredUserId: string, refCode: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const codeRow = await findActiveReferralCodeRow(admin, refCode)

    if (!codeRow) return
    if (codeRow.user_id === referredUserId) return

    await admin.from("referrals").insert({
      referral_code_id: codeRow.id,
      referrer_id: codeRow.user_id,
      referred_user_id: referredUserId,
      status: "pending",
    })
  } catch {
    // Non-fatal — referral tracking failure should never block signup
  }
}

/**
 * Process referral conversion when a referred user completes their first booking.
 * Called from the Stripe webhook on payment_intent.succeeded.
 */
export async function processReferralConversion(guestId: string, bookingId: string): Promise<void> {
  try {
    const admin = createAdminClient()

    const { data: referral } = await admin
      .from("referrals")
      .select("id, referrer_id, referral_code_id")
      .eq("referred_user_id", guestId)
      .eq("status", "pending")
      .maybeSingle()

    if (!referral) return

    const { count } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("guest_id", guestId)
      .eq("status", "confirmed")

    if ((count ?? 0) > 1) return

    const { data: codeRow } = await admin
      .from("referral_codes")
      .select("reward_override_cents")
      .eq("id", referral.referral_code_id)
      .maybeSingle()

    let rewardCents = 1000
    if (codeRow?.reward_override_cents != null) {
      rewardCents = codeRow.reward_override_cents
    } else {
      const { data: setting } = await admin
        .from("platform_settings")
        .select("value")
        .eq("key", "referral_reward_cents")
        .maybeSingle()
      if (setting?.value) rewardCents = Number(setting.value) || 1000
    }

    await admin
      .from("referrals")
      .update({ status: "converted", converted_at: new Date().toISOString() })
      .eq("id", referral.id)

    await admin.from("referral_earnings").insert({
      user_id: referral.referrer_id,
      referral_id: referral.id,
      amount_cents: rewardCents,
      type: "referral_conversion",
      status: "available",
      booking_id: bookingId,
    })

    await admin.rpc("increment_referral_credit", {
      p_user_id: referral.referrer_id,
      p_amount_cents: rewardCents,
    })
  } catch (err) {
    console.error("[referral] processReferralConversion error", err)
  }
}
