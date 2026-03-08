import { randomUUID } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import { sendAutomatedBookingConfirmedMessage } from "@/lib/automated-messages"
import { stripe } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/admin"

type PendingBooking = {
  id: string
  listing_id: string
  guest_id: string
  host_id: string
  stripe_payment_intent_id: string
}

function generateAccessCode() {
  return randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()
}

function readSecret(req: NextRequest) {
  return (
    req.headers.get("x-backfill-secret") ??
    req.headers.get("backfill_secret") ??
    req.headers.get("x-cron-secret") ??
    req.headers.get("cron_secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

function parseDryRunFlag(value: unknown) {
  if (typeof value !== "boolean") return false
  return value
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.BACKFILL_SECRET ?? process.env.CRON_SECRET
  const suppliedSecret = readSecret(req)

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    // Empty body is fine.
  }

  const dryRun = parseDryRunFlag(body.dryRun)
  const limitRaw = Number(body.limit ?? 200)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 1000) : 200

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("bookings")
    .select("id, listing_id, guest_id, host_id, stripe_payment_intent_id")
    .eq("status", "pending")
    .not("stripe_payment_intent_id", "is", null)
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const bookings = ((data ?? []) as PendingBooking[]).filter(
    (row) =>
      Boolean(row.id) &&
      Boolean(row.listing_id) &&
      Boolean(row.guest_id) &&
      Boolean(row.host_id) &&
      Boolean(row.stripe_payment_intent_id)
  )

  const result = {
    scanned: bookings.length,
    dryRun,
    confirmed: 0,
    skippedNotSucceeded: 0,
    skippedMissingIntent: 0,
    skippedUpdateConflict: 0,
    messageErrors: 0,
    failures: [] as Array<{ bookingId: string; intentId: string; reason: string }>,
    confirmedBookingIds: [] as string[],
  }

  for (const booking of bookings) {
    let paymentIntentStatus: string | null = null

    try {
      const intent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id)
      paymentIntentStatus = intent.status
    } catch {
      result.skippedMissingIntent += 1
      result.failures.push({
        bookingId: booking.id,
        intentId: booking.stripe_payment_intent_id,
        reason: "PaymentIntent not found in Stripe",
      })
      continue
    }

    if (paymentIntentStatus !== "succeeded") {
      result.skippedNotSucceeded += 1
      continue
    }

    if (dryRun) {
      result.confirmed += 1
      result.confirmedBookingIds.push(booking.id)
      continue
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "confirmed",
        access_code: generateAccessCode(),
      })
      .eq("id", booking.id)
      .eq("status", "pending")
      .select("id")

    if (updateError) {
      result.failures.push({
        bookingId: booking.id,
        intentId: booking.stripe_payment_intent_id,
        reason: updateError.message,
      })
      continue
    }

    if (!updatedRows || updatedRows.length === 0) {
      result.skippedUpdateConflict += 1
      continue
    }

    result.confirmed += 1
    result.confirmedBookingIds.push(booking.id)

    try {
      await sendAutomatedBookingConfirmedMessage({
        bookingId: booking.id,
        listingId: booking.listing_id,
        guestId: booking.guest_id,
        hostId: booking.host_id,
      })
    } catch {
      result.messageErrors += 1
    }
  }

  return NextResponse.json(result)
}
