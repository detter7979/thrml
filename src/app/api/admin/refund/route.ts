import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAdminApi } from "@/lib/admin-guard"
import { persistBookingRefund } from "@/lib/finance/booking-refund"
import { stripe } from "@/lib/stripe"

const payloadSchema = z.object({
  bookingId: z.string().uuid(),
  amount: z.number().positive(),
})

export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const parsed = payloadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })

  const { bookingId, amount } = parsed.data
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id, guest_id, stripe_payment_intent_id, total_charged, refunded_amount")
    .eq("id", bookingId)
    .maybeSingle()
  if (bookingError) return NextResponse.json({ error: bookingError.message }, { status: 500 })
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  if (!booking.stripe_payment_intent_id) {
    return NextResponse.json({ error: "Booking has no payment intent." }, { status: 400 })
  }

  const amountInCents = Math.round(amount * 100)
  if (amountInCents <= 0) {
    return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 400 })
  }

  const maxRefundableCents = Math.round(Number(booking.total_charged ?? 0) * 100)
  const alreadyRefundedCents = Math.round(Number(booking.refunded_amount ?? 0) * 100)
  if (alreadyRefundedCents + amountInCents > maxRefundableCents) {
    return NextResponse.json({ error: "Refund exceeds total charged amount." }, { status: 400 })
  }

  let refundId: string | null = null
  try {
    const refund = await stripe.refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      amount: amountInCents,
    })
    refundId = refund.id
  } catch (stripeError) {
    const message = stripeError instanceof Error ? stripeError.message : "Stripe refund failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const persisted = await persistBookingRefund(admin, {
    bookingId,
    guestId: typeof booking.guest_id === "string" ? booking.guest_id : null,
    additionalRefundDollars: amount,
    stripeRefundId: refundId!,
    source: "admin_refund",
    restorePromoCredits: true,
  })

  if (!persisted.ok) {
    return NextResponse.json({ error: persisted.error }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    refundId,
    refundedAmount: persisted.refundedAmount,
  })
}
