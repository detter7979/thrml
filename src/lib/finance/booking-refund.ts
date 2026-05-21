import type { SupabaseClient } from "@supabase/supabase-js"

import { dollarsFromCents } from "@/lib/finance/booking-economics"
import { recordFinancialEvent } from "@/lib/finance/events"

type AdminClient = SupabaseClient

export type PersistBookingRefundInput = {
  bookingId: string
  guestId?: string | null
  additionalRefundDollars: number
  stripeRefundId: string
  source: string
  stripeEventId?: string | null
  /** Sync refund_amount with refunded_amount for legacy readers */
  syncRefundAmount?: boolean
  restorePromoCredits?: boolean
}

export async function persistBookingRefund(
  admin: AdminClient,
  input: PersistBookingRefundInput
): Promise<{ ok: true; refundedAmount: number } | { ok: false; error: string }> {
  const { data: booking, error: fetchError } = await admin
    .from("bookings")
    .select("id, guest_id, refunded_amount, refund_amount")
    .eq("id", input.bookingId)
    .maybeSingle()

  if (fetchError) return { ok: false, error: fetchError.message }
  if (!booking) return { ok: false, error: "Booking not found" }

  if (input.stripeRefundId) {
    const { data: existingEvent } = await admin
      .from("financial_events")
      .select("id")
      .eq("event_type", "refund")
      .eq("stripe_object_id", input.stripeRefundId)
      .maybeSingle()
    if (existingEvent?.id) {
      return { ok: true, refundedAmount: Number(booking.refunded_amount ?? 0) }
    }
  }

  const priorRefunded = Number(booking.refunded_amount ?? 0)
  const newRefunded = priorRefunded + input.additionalRefundDollars
  const now = new Date().toISOString()

  const updatePayload: Record<string, unknown> = {
    refunded_amount: newRefunded,
    refunded_at: now,
    stripe_refund_id: input.stripeRefundId,
  }
  if (input.syncRefundAmount !== false) {
    updatePayload.refund_amount = newRefunded
  }

  const { error: updateError } = await admin
    .from("bookings")
    .update(updatePayload)
    .eq("id", input.bookingId)

  if (updateError) return { ok: false, error: updateError.message }

  const refundCents = Math.round(input.additionalRefundDollars * 100)
  const ledger = await recordFinancialEvent(admin, {
    eventType: "refund",
    amountCents: -refundCents,
    bookingId: input.bookingId,
    userId: input.guestId ?? (typeof booking.guest_id === "string" ? booking.guest_id : null),
    stripeEventId: input.stripeEventId ?? null,
    stripeObjectId: input.stripeRefundId,
    source: input.source,
    metadata: {
      refund_dollars: input.additionalRefundDollars,
      cumulative_refunded_dollars: newRefunded,
    },
    occurredAt: now,
  })

  if (!ledger.ok && !ledger.duplicate) {
    console.error("[finance] refund ledger insert failed", {
      bookingId: input.bookingId,
      error: ledger.error,
    })
  }

  if (input.restorePromoCredits !== false) {
    const { error: restoreError } = await admin.rpc("restore_booking_promo_credits", {
      p_booking_id: input.bookingId,
    })
    if (restoreError) {
      console.error("[finance] restore_booking_promo_credits failed", {
        bookingId: input.bookingId,
        error: restoreError.message,
      })
    }
  }

  return { ok: true, refundedAmount: newRefunded }
}

export async function recordBookingCapture(
  admin: AdminClient,
  params: {
    bookingId: string
    guestId: string
    totalChargedCents: number
    hostPayoutCents: number
    promoCreditsCents: number
    source: string
    stripeEventId?: string | null
    stripePaymentIntentId?: string | null
  }
) {
  const platformCashCents = Math.max(0, params.totalChargedCents - params.hostPayoutCents)

  await recordFinancialEvent(admin, {
    eventType: "booking_capture",
    amountCents: platformCashCents,
    bookingId: params.bookingId,
    userId: params.guestId,
    stripeEventId: params.stripeEventId ?? null,
    stripeObjectId: params.stripePaymentIntentId ?? null,
    source: params.source,
    metadata: {
      total_charged_cents: params.totalChargedCents,
      host_payout_cents: params.hostPayoutCents,
    },
  })

  if (params.promoCreditsCents > 0) {
    await recordFinancialEvent(admin, {
      eventType: "credit_subsidy",
      amountCents: -params.promoCreditsCents,
      bookingId: params.bookingId,
      userId: params.guestId,
      stripeEventId: params.stripeEventId ?? null,
      source: params.source,
      metadata: {
        promo_credits_cents: params.promoCreditsCents,
        subsidy_dollars: dollarsFromCents(params.promoCreditsCents),
      },
    })
  }
}
