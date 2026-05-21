import type Stripe from "stripe"
import type { SupabaseClient } from "@supabase/supabase-js"

import { persistBookingRefund } from "@/lib/finance/booking-refund"
import { recordFinancialEvent } from "@/lib/finance/events"

type AdminClient = SupabaseClient

async function findBookingByPaymentIntent(admin: AdminClient, paymentIntentId: string) {
  const { data } = await admin
    .from("bookings")
    .select("id, guest_id, stripe_payment_intent_id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle()
  return data
}

export async function handleStripeRefundEvent(
  admin: AdminClient,
  event: Stripe.Event,
  refund: Stripe.Refund
) {
  const paymentIntentId =
    typeof refund.payment_intent === "string"
      ? refund.payment_intent
      : refund.payment_intent?.id ?? null

  if (!paymentIntentId) {
    console.warn("[finance/webhook] refund missing payment_intent", { refundId: refund.id })
    return
  }

  const booking = await findBookingByPaymentIntent(admin, paymentIntentId)
  if (!booking?.id) {
    console.warn("[finance/webhook] refund with no matching booking", {
      refundId: refund.id,
      paymentIntentId,
    })
    return
  }

  const amountDollars = (refund.amount ?? 0) / 100
  if (amountDollars <= 0) return

  await persistBookingRefund(admin, {
    bookingId: booking.id,
    guestId: typeof booking.guest_id === "string" ? booking.guest_id : null,
    additionalRefundDollars: amountDollars,
    stripeRefundId: refund.id,
    source: `stripe_webhook:${event.type}`,
    stripeEventId: event.id,
    restorePromoCredits: true,
  })
}

export async function handleStripeDisputeEvent(
  admin: AdminClient,
  event: Stripe.Event,
  dispute: Stripe.Dispute
) {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id ?? null
  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id ?? null

  let bookingId: string | null = null
  let guestId: string | null = null

  if (paymentIntentId) {
    const booking = await findBookingByPaymentIntent(admin, paymentIntentId)
    bookingId = booking?.id ?? null
    guestId = typeof booking?.guest_id === "string" ? booking.guest_id : null
  }

  const amountCents = dispute.amount ?? 0
  const status = dispute.status
  const now = new Date().toISOString()

  const { error: upsertError } = await admin.from("stripe_disputes").upsert(
    {
      stripe_dispute_id: dispute.id,
      stripe_charge_id: chargeId,
      stripe_payment_intent_id: paymentIntentId,
      booking_id: bookingId,
      amount_cents: amountCents,
      currency: dispute.currency ?? "usd",
      status,
      reason: dispute.reason ?? null,
      raw_event: { stripe_event_id: event.id, type: event.type },
      opened_at: dispute.created ? new Date(dispute.created * 1000).toISOString() : now,
      closed_at:
        event.type === "charge.dispute.closed" || status === "won" || status === "lost"
          ? now
          : null,
      updated_at: now,
    },
    { onConflict: "stripe_dispute_id" }
  )

  if (upsertError) {
    console.error("[finance/webhook] stripe_disputes upsert failed", upsertError.message)
  }

  if (event.type === "charge.dispute.created" || event.type === "charge.dispute.funds_withdrawn") {
    await recordFinancialEvent(admin, {
      eventType: "chargeback",
      amountCents: -amountCents,
      bookingId,
      userId: guestId,
      stripeEventId: event.id,
      stripeObjectId: dispute.id,
      source: `stripe_webhook:${event.type}`,
      metadata: { status, reason: dispute.reason ?? null },
    })
  }

  if (event.type === "charge.dispute.closed" && dispute.status === "won") {
    await recordFinancialEvent(admin, {
      eventType: "chargeback_reversal",
      amountCents: amountCents,
      bookingId,
      userId: guestId,
      stripeEventId: event.id,
      stripeObjectId: `${dispute.id}_won`,
      source: `stripe_webhook:${event.type}`,
      metadata: { status },
    })
  }
}
