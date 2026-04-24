import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { z } from "zod"

import { requireAdminApi } from "@/lib/admin-guard"
import { stripe } from "@/lib/stripe"

const bodySchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/, "Code: letters, numbers, underscore, hyphen"),
    percentOff: z.number().positive().max(100).optional(),
    amountOffCents: z.number().int().positive().max(1_000_000_00).optional(),
    duration: z.enum(["once", "repeating", "forever"]).default("once"),
    durationInMonths: z.number().int().positive().max(36).optional(),
    maxRedemptions: z.number().int().positive().optional(),
  })
  .refine((v) => (v.percentOff != null) !== (v.amountOffCents != null), {
    message: "Provide exactly one of percentOff or amountOffCents",
  })
  .refine((v) => v.duration !== "repeating" || v.durationInMonths != null, {
    message: "durationInMonths is required when duration is repeating",
  })

export async function POST(req: NextRequest) {
  const { error, admin: _admin } = await requireAdminApi()
  if (error || !_admin) return error

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 })
  }

  const { code, percentOff, amountOffCents, duration, durationInMonths, maxRedemptions } = parsed.data

  try {
    const couponParams: Stripe.CouponCreateParams = {
      duration,
      ...(duration === "repeating" && durationInMonths ? { duration_in_months: durationInMonths } : {}),
    }
    if (percentOff != null) {
      couponParams.percent_off = percentOff
    } else if (amountOffCents != null) {
      couponParams.amount_off = amountOffCents
      couponParams.currency = "usd"
    }

    const coupon = await stripe.coupons.create(couponParams)

    const promotionCode = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code: code.toUpperCase(),
      max_redemptions: maxRedemptions,
    })

    return NextResponse.json({
      couponId: coupon.id,
      promotionCodeId: promotionCode.id,
      customerFacingCode: promotionCode.code,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe error"
    console.error("[admin/promo-codes]", e)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
