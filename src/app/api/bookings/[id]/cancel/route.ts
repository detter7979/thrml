import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  calculateHostPenalty,
  formatMoney,
  hoursUntilSession,
  parseSessionStart,
} from "@/lib/cancellations"
import type { CancellationPolicy } from "@/lib/constants/cancellation-policies"
import { getCancellationPolicy } from "@/lib/constants/cancellation-policies"
import {
  sendGuestCancellationConfirmation,
  sendGuestHostCancelledNotice,
  sendHostCancellationConfirmation,
  sendHostCancellationNotice,
} from "@/lib/emails"
import { requireAuth } from "@/lib/auth-check"
import { rateLimit } from "@/lib/rate-limit"
import { stripe } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/admin"

type Params = { id: string }

const cancelSchema = z.object({
  cancelled_by: z.enum(["guest", "host"]),
  reason: z.string().trim().max(500).optional(),
})

type RefundPreview = {
  refundAmount: number
  policyApplied: string
}

function parseMissingColumn(errorMessage: string) {
  const match = errorMessage.match(/'([^']+)' column/i)
  return match?.[1] ?? null
}

function normalizePolicyKey(policy: string | null | undefined): CancellationPolicy {
  const value = String(policy ?? "").trim().toLowerCase()
  if (value === "flexible" || value === "moderate" || value === "strict") return value
  return "flexible"
}

function calculateRefundPreview(params: {
  cancelledBy: "guest" | "host"
  listingPolicy: string | null | undefined
  sessionDate: string | null | undefined
  startTime: string | null | undefined
  totalCharged: number
  serviceFee: number
}): RefundPreview {
  const { cancelledBy, listingPolicy, sessionDate, startTime, totalCharged, serviceFee } = params
  const policyKey = normalizePolicyKey(listingPolicy)
  const sessionStart = parseSessionStart(sessionDate, startTime)
  const hoursUntil = sessionStart ? hoursUntilSession(sessionStart) : 0
  const windowHours = { flexible: 24, moderate: 48, strict: 72 }[policyKey]
  const refundableBase = Math.max(0, Number(totalCharged) - Number(serviceFee))

  if (cancelledBy === "host") {
    return {
      refundAmount: refundableBase,
      policyApplied: "host_full_refund",
    }
  }

  const isEligibleForFullRefund = hoursUntil >= windowHours
  if (isEligibleForFullRefund) {
    return {
      refundAmount: refundableBase,
      policyApplied: `${policyKey}_full_refund`,
    }
  }

  if (policyKey === "strict") {
    return {
      refundAmount: 0,
      policyApplied: "strict_no_refund",
    }
  }

  return {
    refundAmount: Math.floor(refundableBase * 0.5),
    policyApplied: `${policyKey}_partial_refund`,
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const limited = await rateLimit(req, {
    maxRequests: 20,
    windowMs: 60 * 1000,
    identifier: "bookings",
  })
  if (limited) return limited

  const { id } = await params
  const bodyRaw = await req.json().catch(() => null)
  const parsed = cancelSchema.safeParse(bodyRaw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 })
  }

  const { error: authError, session } = await requireAuth()
  if (authError || !session) {
    return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("*")
    .eq("id", id)
    .single()

  if (bookingError || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  if (booking.status === "cancelled") {
    return NextResponse.json({ error: "Booking already cancelled" }, { status: 409 })
  }

  const cancelledBy = parsed.data.cancelled_by
  const isGuestRequester = cancelledBy === "guest" && booking.guest_id === session.user.id
  let isHostRequester = cancelledBy === "host" && booking.host_id === session.user.id
  if (!isGuestRequester && !isHostRequester && cancelledBy === "host") {
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", session.user.id)
      .maybeSingle()
    if (profile?.is_admin) {
      isHostRequester = true
    }
  }
  if (!isGuestRequester && !isHostRequester) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const [{ data: listing }, { data: guestProfile }, { data: hostProfile }] = await Promise.all([
    admin
      .from("listings")
      .select("id, title, service_type, cancellation_policy")
      .eq("id", booking.listing_id)
      .maybeSingle(),
    admin.from("profiles").select("id, full_name, email").eq("id", booking.guest_id).maybeSingle(),
    admin.from("profiles").select("id, full_name, email").eq("id", booking.host_id).maybeSingle(),
  ])
  const [guestAuthUser, hostAuthUser] = await Promise.all([
    admin.auth.admin.getUserById(booking.guest_id),
    admin.auth.admin.getUserById(booking.host_id),
  ])
  const guestEmail = guestAuthUser.data.user?.email ?? guestProfile?.email ?? null
  const hostEmail = hostAuthUser.data.user?.email ?? hostProfile?.email ?? null

  const refundPreview = calculateRefundPreview({
    cancelledBy,
    listingPolicy: typeof listing?.cancellation_policy === "string" ? listing.cancellation_policy : null,
    sessionDate: booking.session_date ?? null,
    startTime: booking.start_time ?? null,
    totalCharged: Number(booking.total_charged ?? 0),
    serviceFee: Number(booking.service_fee ?? 0),
  })
  const refundAmount = Math.max(0, Number(refundPreview.refundAmount ?? 0))

  if (booking.status === "pending_host" && cancelledBy === "guest") {
    if (booking.stripe_payment_intent_id) {
      try {
        await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to release authorization hold"
        return NextResponse.json({ error: message }, { status: 500 })
      }
    }

    const { error: pendingCancelError } = await admin
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_by: cancelledBy,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: parsed.data.reason ?? null,
        refund_amount: 0,
        refund_status: "none",
        stripe_refund_id: null,
        refunded_amount: 0,
        refunded_at: null,
      })
      .eq("id", id)
      .eq("status", "pending_host")
    if (pendingCancelError) {
      return NextResponse.json({ error: pendingCancelError.message }, { status: 500 })
    }

    await admin.from("booked_slots").delete().eq("booking_id", id)
    return NextResponse.json({
      refund_amount: 0,
      refund_status: "none",
      policy_applied: "pending_host_guest_cancelled",
    })
  }

  let refund: { id: string } | null = null
  let refundIssued = false
  if (refundAmount > 0 && booking.stripe_payment_intent_id) {
    refund = await stripe.refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      amount: Math.round(refundAmount * 100),
      reason: "requested_by_customer",
    })
    refundIssued = true
  }

  const updatePayload: Record<string, unknown> = {
    status: "cancelled",
    cancelled_by: cancelledBy,
    cancelled_at: new Date().toISOString(),
    cancellation_reason: parsed.data.reason ?? null,
    refund_amount: refundAmount,
    refund_status: refund ? "issued" : "none",
    stripe_refund_id: refund?.id ?? null,
    refunded_amount: refundAmount,
    refunded_at: refund ? new Date().toISOString() : null,
  }

  let bookingUpdateSucceeded = false
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await admin.from("bookings").update(updatePayload).eq("id", id)
    if (!error) {
      bookingUpdateSucceeded = true
      break
    }

    const missingColumn = parseMissingColumn(error.message ?? "")
    if (!missingColumn || !(missingColumn in updatePayload)) {
      if (refundIssued) {
        console.error("[bookings/cancel] Refund issued but booking update failed. Manual review required.", {
          bookingId: id,
          stripeRefundId: refund?.id ?? null,
          stripePaymentIntentId: booking.stripe_payment_intent_id ?? null,
          reason: error.message ?? "unknown",
        })
      }
      return NextResponse.json({ error: error.message ?? "Unable to cancel booking" }, { status: 500 })
    }
    delete updatePayload[missingColumn]
  }
  if (!bookingUpdateSucceeded) {
    if (refundIssued) {
      console.error("[bookings/cancel] Refund issued but booking update did not persist. Manual review required.", {
        bookingId: id,
        stripeRefundId: refund?.id ?? null,
        stripePaymentIntentId: booking.stripe_payment_intent_id ?? null,
      })
    }
    return NextResponse.json({ error: "Unable to cancel booking" }, { status: 500 })
  }

  const deleteBookedSlot = async (tableName: "booked_slot" | "booked_slots") => {
    await admin.from(tableName).delete().eq("booking_id", id)
  }
  await deleteBookedSlot("booked_slot")
  await deleteBookedSlot("booked_slots")

  let hostPenalty:
    | {
        policyApplied: string
        penaltyAmount: number
        requiresReview: boolean
        hoursBeforeSession: number
      }
    | undefined

  if (cancelledBy === "host") {
    const sessionStart = parseSessionStart(booking.session_date, booking.start_time)
    const hoursBefore = sessionStart ? hoursUntilSession(sessionStart) : 0
    const ninetyDaysAgoIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { count } = await admin
      .from("host_cancellations")
      .select("id", { count: "exact", head: true })
      .eq("host_id", booking.host_id)
      .gte("cancelled_at", ninetyDaysAgoIso)

    const penalty = calculateHostPenalty(hoursBefore, Number(count ?? 0) === 0)
    hostPenalty = penalty

    const hostCancellationPayload: Record<string, unknown> = {
      host_id: booking.host_id,
      booking_id: booking.id,
      listing_id: booking.listing_id,
      cancelled_at: new Date().toISOString(),
      cancelled_by: "host",
      hours_before_session: Number(hoursBefore.toFixed(2)),
      penalty_amount: penalty.penaltyAmount,
      policy_applied: penalty.policyApplied,
      requires_review: penalty.requiresReview,
      reason: parsed.data.reason ?? null,
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const { error } = await admin.from("host_cancellations").insert(hostCancellationPayload)
      if (!error) break
      const missingColumn = parseMissingColumn(error.message ?? "")
      if (!missingColumn || !(missingColumn in hostCancellationPayload)) break
      delete hostCancellationPayload[missingColumn]
    }
  }

  const emailBooking = {
    id: booking.id,
    guest_id: booking.guest_id,
    host_id: booking.host_id,
    session_date: booking.session_date ?? null,
    start_time: booking.start_time ?? null,
    end_time: booking.end_time ?? null,
    total_charged: Number(booking.total_charged ?? 0),
    host_payout: Number(booking.host_payout ?? 0),
    guest_count: Number(booking.guest_count ?? 1),
    guest_name: guestProfile?.full_name ?? null,
    guest_email: guestEmail,
    host_name: hostProfile?.full_name ?? null,
    host_email: hostEmail,
    listing_title: listing?.title ?? "Thrml session",
    service_type: listing?.service_type ?? "sauna",
    cancellation_policy: listing?.cancellation_policy ?? null,
    cancellation_reason: parsed.data.reason ?? null,
  }

  try {
    if (cancelledBy === "guest") {
      await Promise.all([
        sendGuestCancellationConfirmation(emailBooking, refundAmount),
        sendHostCancellationNotice(emailBooking, refundAmount, undefined, "guest"),
      ])
    } else {
      await Promise.all([
        sendGuestHostCancelledNotice(emailBooking, refundAmount),
        sendHostCancellationConfirmation(emailBooking),
      ])
    }
  } catch (emailError) {
    console.error("[bookings/cancel] Cancellation email failed:", emailError)
  }

  const policy = getCancellationPolicy(listing?.cancellation_policy)
  const responsePolicy =
    hostPenalty?.policyApplied ??
    refundPreview.policyApplied ??
    `${policy.label.toLowerCase()}_policy`

  return NextResponse.json({
    refund_amount: refundAmount,
    refund_status: refund ? "issued" : "none",
    policy_applied: responsePolicy,
    message:
      cancelledBy === "host" && hostPenalty?.penaltyAmount
        ? `Host penalty applied: ${formatMoney(hostPenalty.penaltyAmount)}`
        : undefined,
  })
}
