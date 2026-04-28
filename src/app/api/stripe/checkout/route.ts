import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { z } from "zod"

import {
  calculateFees,
  calculateProtectedBookingCreditCents,
  fetchPlatformFeePercents,
  STRIPE_MIN_CHARGE_CENTS,
} from "@/lib/fees"
import { calculateBookingSubtotal } from "@/lib/pricing"
import { getFallbackServiceType } from "@/lib/service-types"
import { applyMemoryRateLimit, requestIp } from "@/lib/security"
import { roundUpTo30 } from "@/lib/slots"
import { stripe } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const checkoutSchema = z.object({
  listingId: z.string().trim().min(1),
  guestCount: z.coerce.number().int().min(1),
  sessionDate: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  durationHours: z.coerce.number().positive(),
  waiver_version: z.string().optional(),
  waiverAccepted: z.boolean().refine((v) => v === true, {
    message: "Waiver must be explicitly accepted before checkout.",
  }),
  disclaimersAccepted: z.boolean(),
  newsletterOptIn: z.boolean().optional().default(false),
  applyReferralCredit: z.boolean().optional().default(false),
})

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part))
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function durationBetweenTimes(startTime: string, endTime: string) {
  const start = toMinutes(startTime)
  const end = toMinutes(endTime)
  if (start === null || end === null || end <= start) return null
  return end - start
}

function normalizeDayIndex(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0 && value <= 6) return value
    if (value >= 1 && value <= 7) return value % 7
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    const aliases: Record<string, number> = {
      sun: 0,
      sunday: 0,
      mon: 1,
      monday: 1,
      tue: 2,
      tues: 2,
      tuesday: 2,
      wed: 3,
      wednesday: 3,
      thu: 4,
      thur: 4,
      thurs: 4,
      thursday: 4,
      fri: 5,
      friday: 5,
      sat: 6,
      saturday: 6,
    }
    if (normalized in aliases) return aliases[normalized]
    const asNumber = Number(normalized)
    if (Number.isFinite(asNumber)) return normalizeDayIndex(asNumber)
  }
  return null
}

function withinAvailability(
  availability: unknown,
  sessionDate: string,
  startTime: string,
  endTime: string
) {
  if (!Array.isArray(availability) || availability.length === 0) return true
  const date = new Date(`${sessionDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return false
  const jsDay = date.getDay()

  const sessionStart = toMinutes(startTime)
  const sessionEnd = toMinutes(endTime)
  if (sessionStart === null || sessionEnd === null || sessionEnd <= sessionStart) return false

  const windows = availability
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .filter((item) => {
      const dayIndex =
        normalizeDayIndex(item.day) ??
        normalizeDayIndex(item.day_of_week) ??
        normalizeDayIndex(item.dayIndex)
      const dayMatches = dayIndex === jsDay
      const enabled =
        typeof item.enabled === "boolean"
          ? item.enabled
          : typeof item.is_available === "boolean"
            ? item.is_available
            : typeof item.isAvailable === "boolean"
              ? item.isAvailable
              : true
      return dayMatches && enabled
    })

  if (!windows.length) return false

  return windows.some((window) => {
    const start = toMinutes(
      typeof window.start === "string"
        ? window.start
        : typeof window.start_time === "string"
          ? window.start_time
          : "10:00"
    )
    const end = toMinutes(
      typeof window.end === "string"
        ? window.end
        : typeof window.end_time === "string"
          ? window.end_time
          : "18:00"
    )
    if (start === null || end === null || end <= start) return false
    return sessionStart >= start && sessionEnd <= end
  })
}

async function hasOverlappingBooking(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  listingId: string
  sessionDate: string
  startTime: string
  endTime: string
}) {
  const { supabase, listingId, sessionDate, startTime, endTime } = params
  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("listing_id", listingId)
    .eq("session_date", sessionDate)
    .in("status", ["pending_host", "pending", "confirmed", "completed"])
    .lt("start_time", endTime)
    .gt("end_time", startTime)
    .limit(1)

  if (error) return false
  return Boolean((data ?? []).length)
}

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

async function reserveSlotAtomically(params: {
  admin: ReturnType<typeof createAdminClient>
  listingId: string
  guestId: string
  sessionDate: string
  startTime: string
  endTime: string
}) {
  const { admin, listingId, guestId, sessionDate, startTime, endTime } = params
  const { data, error } = await admin.rpc("reserve_booked_slot_atomic", {
    p_listing_id: listingId,
    p_guest_id: guestId,
    p_session_date: sessionDate,
    p_start_time: startTime,
    p_end_time: endTime,
  })

  if (error) {
    return { ok: false as const, conflict: false, message: error.message }
  }

  const row = Array.isArray(data) ? data[0] : data
  const success = Boolean((row as { success?: boolean } | null)?.success)
  const slotId = (row as { slot_id?: string | null } | null)?.slot_id ?? null
  const errorCode = (row as { error_code?: string | null } | null)?.error_code ?? null
  const errorMessage = (row as { error_message?: string | null } | null)?.error_message ?? null

  if (!success || !slotId) {
    const conflict = errorCode === "slot_conflict"
    return {
      ok: false as const,
      conflict,
      message: errorMessage ?? (conflict ? "Slot conflict" : "Unable to reserve slot"),
    }
  }

  return { ok: true as const, slotId }
}

function isNoDoubleBookingConstraintError(error: unknown) {
  const message =
    typeof (error as { message?: unknown })?.message === "string"
      ? (error as { message: string }).message
      : ""
  const code =
    typeof (error as { code?: unknown })?.code === "string"
      ? (error as { code: string }).code
      : ""
  return (
    code === "23505" &&
    (message.includes("no_double_booking") || message.includes("duplicate key value"))
  )
}

function listingInstantBook(listing: Record<string, unknown>) {
  return Boolean(listing.is_instant_book ?? listing.instant_book)
}

export async function POST(req: NextRequest) {
  try {
    const ip = requestIp(req)
    const limit = await applyMemoryRateLimit({
      key: `api:stripe:checkout:${ip}`,
      max: 20,
      windowMs: 10 * 60_000,
    })
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many checkout attempts. Please try again soon." }, { status: 429 })
    }

    console.log("stripe route hit", "checkout-start")
    console.log("[stripe/checkout] Request received")
    const supabase = await createClient()
    const admin = createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.log("[stripe/checkout] Unauthorized: missing user")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const parsed = checkoutSchema.safeParse(body)

    if (!parsed.success) {
      console.error("[stripe/checkout] Invalid payload", {
        body,
        details: parsed.error.flatten(),
      })
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const {
      listingId,
      guestCount,
      sessionDate,
      startTime,
      endTime,
      durationHours,
      waiver_version,
      disclaimersAccepted,
      newsletterOptIn,
      applyReferralCredit,
    } = parsed.data

    const normalizedDate = parseIsoDate(sessionDate)
    if (!normalizedDate) {
      return NextResponse.json({ error: "Invalid session_date format. Use YYYY-MM-DD." }, { status: 400 })
    }

    console.log("[stripe/checkout] Parsed payload", {
      listingId,
      guestCount,
      sessionDate,
      startTime,
      endTime,
      durationHours,
      disclaimersAccepted,
      newsletterOptIn,
      userId: user.id,
    })

    if (!disclaimersAccepted) {
      console.log("[stripe/checkout] Blocking: disclaimers not accepted")
      return NextResponse.json(
        { error: "Please accept the required waivers/disclaimers before checkout." },
        { status: 400 }
      )
    }

    if (!waiver_version || !waiver_version.trim()) {
      return NextResponse.json({ error: "Waiver acceptance required" }, { status: 400 })
    }

    const [{ data: listing, error: listingError }, { data: availabilityRows }] = await Promise.all([
      supabase
        .from("listings")
        .select("*")
        .eq("id", listingId)
        .single(),
      supabase
        .from("availability")
        .select("day_of_week, start_time, end_time, is_available")
        .eq("listing_id", listingId)
        .order("day_of_week", { ascending: true }),
    ])

    if (listingError || !listing) {
      console.log("[stripe/checkout] Listing not found", {
        listingId,
        listingError: listingError?.message ?? null,
      })
      return NextResponse.json({ error: "Listing not found" }, { status: 404 })
    }

    const { data: hostProfile } = await admin
      .from("profiles")
      .select(
        "stripe_account_id, stripe_payouts_enabled, stripe_charges_enabled, stripe_onboarding_complete"
      )
      .eq("id", listing.host_id)
      .single()

    const host = hostProfile
    console.log("[stripe/checkout] Host profile fetched", {
      hostId: listing.host_id,
      host,
    })
    console.log("[stripe/checkout] Evaluating mock host check", {
      stripeAccountId: host?.stripe_account_id ?? null,
    })
    const isMockHost = host?.stripe_account_id?.startsWith("acct_mock_")
    console.log("[stripe/checkout] Mock host check result", { isMockHost })

    if (!isMockHost && (!host?.stripe_account_id || !host?.stripe_payouts_enabled)) {
      console.log("[stripe/checkout] Blocking: host payouts not configured", {
        isMockHost,
        stripeAccountId: host?.stripe_account_id ?? null,
        stripePayoutsEnabled: host?.stripe_payouts_enabled ?? null,
      })
      return NextResponse.json(
        { error: "host_payouts_not_configured" },
        { status: 400 }
      )
    }

    const maxGuests = Math.max(1, Number(listing.capacity ?? 1))
    if (guestCount > maxGuests) {
      console.log("[stripe/checkout] Blocking: guest count exceeds capacity", {
        guestCount,
        maxGuests,
      })
      return NextResponse.json(
        { error: `This listing allows up to ${maxGuests} ${maxGuests === 1 ? "person" : "people"} per session` },
        { status: 400 }
      )
    }

    const listingServiceTypeId =
      typeof listing.service_type === "string" && listing.service_type.trim()
        ? listing.service_type.trim()
        : "sauna"
    const { data: serviceType } = await supabase
      .from("service_types")
      .select("min_duration_minutes, max_duration_minutes, duration_increment_minutes, session_type, booking_model")
      .eq("id", listingServiceTypeId)
      .maybeSingle()

    // Match listing detail + /book pages: use service_types.booking_model (with canonical fallback),
    // not listing.session_type, so slot duration and checkout validation stay aligned.
    const fallbackMeta = getFallbackServiceType(listingServiceTypeId)
    const bookingModel: "hourly" | "fixed_session" =
      serviceType?.booking_model === "fixed_session" || serviceType?.booking_model === "hourly"
        ? serviceType.booking_model
        : fallbackMeta?.booking_model ?? "hourly"
    const rawBlockMins = Number(
      bookingModel === "fixed_session"
        ? listing.fixed_session_minutes ??
            listing.min_duration_override_minutes ??
            serviceType?.min_duration_minutes ??
            30
        : listing.min_duration_override_minutes ?? serviceType?.min_duration_minutes ?? 30
    )
    const blockMins = Math.max(30, roundUpTo30(Number.isFinite(rawBlockMins) ? rawBlockMins : 30))
    const minMins = blockMins
    const maxMins =
      bookingModel === "fixed_session"
        ? blockMins
        : Math.max(blockMins, Number(listing.max_duration_override_minutes ?? serviceType?.max_duration_minutes ?? 240))
    const incrementMins = 30
    const durationMins = Math.round(durationHours * 60)
    const slotMins = durationBetweenTimes(startTime, endTime)
    if (!slotMins) {
      console.log("[stripe/checkout] Blocking: invalid start/end time", { startTime, endTime })
      return NextResponse.json(
        { error: "Invalid start/end time for this booking." },
        { status: 400 }
      )
    }
    if (durationMins !== slotMins) {
      console.log("[stripe/checkout] Blocking: duration mismatch slot", {
        durationMins,
        slotMins,
      })
      return NextResponse.json(
        { error: "Selected duration does not match the chosen time slot." },
        { status: 400 }
      )
    }
    if (durationMins < minMins) {
      console.log("[stripe/checkout] Blocking: below min duration", { durationMins, minMins })
      return NextResponse.json(
        { error: `Minimum session length is ${minMins} minutes` },
        { status: 400 }
      )
    }
    if (durationMins > maxMins) {
      console.log("[stripe/checkout] Blocking: above max duration", { durationMins, maxMins })
      return NextResponse.json(
        { error: `Maximum session length is ${maxMins} minutes` },
        { status: 400 }
      )
    }
    if ((durationMins - minMins) % Math.max(30, incrementMins) !== 0) {
      console.log("[stripe/checkout] Blocking: invalid duration increment", {
        durationMins,
        minMins,
        incrementMins,
      })
      return NextResponse.json(
        { error: `Session length must follow ${incrementMins}-minute increments` },
        { status: 400 }
      )
    }

    const chargeDurationHours = bookingModel === "fixed_session" ? 1 : durationHours
    const subtotalRow = calculateBookingSubtotal(listing, guestCount, chargeDurationHours)
    const feePercents = await fetchPlatformFeePercents(admin)
    const fees = calculateFees(
      subtotalRow.subtotal,
      feePercents.guestFeePercent,
      feePercents.hostFeePercent
    )
    let referralCreditAppliedCents = 0
    let userCreditAppliedCents = 0
    if (applyReferralCredit) {
      const [{ data: guestWalletProfile }, { data: userCreditRow }] = await Promise.all([
        admin.from("profiles").select("referral_credit_cents").eq("id", user.id).maybeSingle(),
        admin.from("user_credits").select("balance").eq("user_id", user.id).maybeSingle(),
      ])

      const referralWalletCents = Math.max(0, Number(guestWalletProfile?.referral_credit_cents ?? 0))
      const userWalletCents = Math.max(0, Number(userCreditRow?.balance ?? 0))
      const dueCents = Math.round(fees.guestTotal * 100)
      const hostPayoutCents = Math.round(fees.hostPayout * 100)
      const maxCreditCents = calculateProtectedBookingCreditCents({
        guestTotalCents: dueCents,
        hostPayoutCents,
        availableCreditCents: referralWalletCents + userWalletCents,
        stripeMinChargeCents: STRIPE_MIN_CHARGE_CENTS,
      })
      if (maxCreditCents > 0) {
        referralCreditAppliedCents = Math.min(referralWalletCents, maxCreditCents)
        userCreditAppliedCents = Math.min(
          userWalletCents,
          Math.max(0, maxCreditCents - referralCreditAppliedCents)
        )
        const totalApplied = referralCreditAppliedCents + userCreditAppliedCents
        fees.guestTotal = (dueCents - totalApplied) / 100
      }
    }
    const isInstantBook = listingInstantBook(listing as Record<string, unknown>)
    const confirmationDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const listingAvailability = Array.isArray(listing.availability)
      ? (listing.availability as unknown[])
      : []
    const fallbackAvailability = (availabilityRows ?? []).map((row) => ({
      day_of_week: Number(row.day_of_week ?? 0),
      start_time: typeof row.start_time === "string" ? row.start_time : "08:00:00",
      end_time: typeof row.end_time === "string" ? row.end_time : "20:00:00",
      is_available: row.is_available !== false,
    }))
    const availabilityPayload = listingAvailability.length
      ? listingAvailability
      : fallbackAvailability

    if (!withinAvailability(availabilityPayload, sessionDate, startTime, endTime)) {
      console.log("[stripe/checkout] Blocking: outside availability", {
        sessionDate,
        startTime,
        endTime,
        availabilityRows: availabilityPayload,
      })
      return NextResponse.json(
        {
          error:
            "The selected time is outside the host's available hours. Please choose another time slot.",
        },
        { status: 400 }
      )
    }

    const { data: blackoutRow, error: blackoutError } = await supabase
      .from("listing_blackout_dates")
      .select("id")
      .eq("listing_id", listingId)
      .eq("blackout_date", normalizedDate)
      .maybeSingle()
    if (!blackoutError && blackoutRow?.id) {
      return NextResponse.json({ error: "This date is not available" }, { status: 400 })
    }

    const slotReservation = await reserveSlotAtomically({
      admin,
      listingId,
      guestId: user.id,
      sessionDate: normalizedDate,
      startTime,
      endTime,
    })
    if (!slotReservation.ok && slotReservation.conflict) {
      console.log("[stripe/checkout] Blocking: booked_slots conflict", {
        listingId,
        sessionDate: normalizedDate,
        startTime,
        endTime,
      })
      return NextResponse.json(
        { error: "This time slot was just booked. Please select another available time." },
        { status: 409 }
      )
    }
    if (!slotReservation.ok) {
      console.error("[stripe/checkout] Failed atomic slot reservation", slotReservation)
      return NextResponse.json(
        { error: slotReservation.message || "Unable to reserve slot right now." },
        { status: 500 }
      )
    }

    const overlapExists = await hasOverlappingBooking({
      supabase,
      listingId,
      sessionDate: normalizedDate,
      startTime,
      endTime,
    })

    if (overlapExists) {
      await admin.from("booked_slots").delete().eq("id", slotReservation.slotId)
      console.log("[stripe/checkout] Blocking: overlap booking conflict", {
        listingId,
        sessionDate: normalizedDate,
        startTime,
        endTime,
      })
      return NextResponse.json(
        {
          error:
            "This time slot was just booked. Please choose another available time.",
        },
        { status: 409 }
      )
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        listing_id: listingId,
        guest_id: user.id,
        host_id: listing.host_id,
        session_date: normalizedDate,
        start_time: startTime,
        end_time: endTime,
        duration_hours: durationHours,
        guest_count: guestCount,
        price_per_person: subtotalRow.pricePerPerson,
        subtotal: fees.subtotal,
        service_fee: fees.guestFee,
        guest_fee: fees.guestFee,
        host_fee: fees.hostFee,
        host_payout: fees.hostPayout,
        total_charged: fees.guestTotal,
        guest_total: fees.guestTotal,
        referral_credit_applied_cents: referralCreditAppliedCents,
        user_credit_applied_cents: userCreditAppliedCents,
        status: isInstantBook ? "pending" : "pending_host",
        confirmation_deadline: isInstantBook ? null : confirmationDeadline,
        waiver_version: waiver_version.trim(),
        waiver_accepted: true,
        waiver_accepted_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (bookingError || !booking) {
      await admin.from("booked_slots").delete().eq("id", slotReservation.slotId)
      if (isNoDoubleBookingConstraintError(bookingError)) {
        const { data: existingBooking } = await admin
          .from("bookings")
          .select("id, stripe_payment_intent_id, status, guest_id, host_id, total_charged, host_payout")
          .eq("listing_id", listingId)
          .eq("guest_id", user.id)
          .eq("session_date", normalizedDate)
          .eq("start_time", startTime)
          .eq("end_time", endTime)
          .in("status", ["pending", "pending_host", "confirmed", "completed"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (existingBooking?.id && existingBooking.stripe_payment_intent_id) {
          const reusableStatuses = new Set([
            "requires_payment_method",
            "requires_confirmation",
            "requires_action",
            "processing",
          ])

          const tryResumeOrReplaceDuplicateBooking = async (): Promise<{
            clientSecret: string
            bookingId: string
          } | null> => {
            try {
              const existingIntent = await stripe.paymentIntents.retrieve(
                existingBooking.stripe_payment_intent_id as string
              )
              if (
                existingIntent.client_secret &&
                reusableStatuses.has(existingIntent.status)
              ) {
                console.log("[stripe/checkout] Resuming existing booking after duplicate insert", {
                  bookingId: existingBooking.id,
                  paymentIntentId: existingIntent.id,
                  status: existingBooking.status,
                })
                return {
                  clientSecret: existingIntent.client_secret,
                  bookingId: existingBooking.id as string,
                }
              }
              console.log("[stripe/checkout] Existing payment intent not reusable; creating replacement", {
                bookingId: existingBooking.id,
                paymentIntentId: existingIntent.id,
                status: existingIntent.status,
              })
            } catch (resumeError) {
              console.error("[stripe/checkout] Failed to resume existing payment intent", {
                bookingId: existingBooking.id,
                paymentIntentId: existingBooking.stripe_payment_intent_id,
                error: resumeError instanceof Error ? resumeError.message : String(resumeError),
              })
            }

            const guestTotalNum = Number(existingBooking.total_charged ?? 0)
            const hostPayoutNum = Number(existingBooking.host_payout ?? 0)
            const amountCents = Math.round(guestTotalNum * 100)
            const hostPayoutCents = Math.round(hostPayoutNum * 100)
            const resumeSelfBooking =
              typeof existingBooking.guest_id === "string" &&
              typeof existingBooking.host_id === "string" &&
              existingBooking.guest_id === existingBooking.host_id
            const resumeParams: Stripe.PaymentIntentCreateParams = {
              amount: amountCents,
              currency: "usd",
              capture_method: isInstantBook ? "automatic" : "manual",
              metadata: {
                booking_id: existingBooking.id as string,
                listing_id: listingId,
                booked_slot_id: slotReservation.slotId,
                booking_flow: isInstantBook ? "instant_book" : "request_to_book",
                resumed_after_retrieve_failure: "true",
              },
            }
            if (!isMockHost && host?.stripe_account_id && !resumeSelfBooking) {
              resumeParams.transfer_data = {
                destination: host.stripe_account_id,
                amount: hostPayoutCents,
              }
            }
            try {
              const replacementIntent = await stripe.paymentIntents.create(resumeParams)
              const { error: replaceUpdateError } = await admin
                .from("bookings")
                .update({ stripe_payment_intent_id: replacementIntent.id })
                .eq("id", existingBooking.id)
              if (!replaceUpdateError && replacementIntent.client_secret) {
                console.log("[stripe/checkout] Replaced expired/invalid payment intent after duplicate insert", {
                  bookingId: existingBooking.id,
                  paymentIntentId: replacementIntent.id,
                })
                return {
                  clientSecret: replacementIntent.client_secret,
                  bookingId: existingBooking.id as string,
                }
              }
              console.error("[stripe/checkout] Failed to persist replacement payment intent", {
                bookingId: existingBooking.id,
                replaceUpdateError: replaceUpdateError?.message ?? null,
              })
            } catch (replaceError) {
              console.error("[stripe/checkout] Replacement PaymentIntent failed", replaceError)
            }
            return null
          }

          const resumed = await tryResumeOrReplaceDuplicateBooking()
          if (resumed) {
            return NextResponse.json(resumed)
          }
        }

        return NextResponse.json(
          {
            error:
              "This time slot already has an active booking attempt. Please refresh and try another available time.",
          },
          { status: 409 }
        )
      }
      console.error("[stripe/checkout] Failed creating booking", {
        bookingError: bookingError?.message ?? null,
        bookingErrorCode: (bookingError as {code?: string} | null)?.code ?? null,
        bookingErrorDetails: bookingError ?? null,
      })
      return NextResponse.json({ error: `Failed to create booking: ${bookingError?.message ?? "unknown"}` }, { status: 500 })
    }
    console.log("stripe route hit", booking.id)
    console.log("[stripe/checkout] Booking created as pending", {
      bookingId: booking.id,
      status: booking.status,
    })

    await admin
      .from("booked_slots")
      .update({
        booking_id: booking.id,
      })
      .eq("id", slotReservation.slotId)

    const isSelfBooking =
      typeof booking.guest_id === "string" &&
      typeof booking.host_id === "string" &&
      booking.guest_id === booking.host_id

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: Math.round(fees.guestTotal * 100),
      currency: "usd",
      capture_method: isInstantBook ? "automatic" : "manual",
      metadata: {
        booking_id: booking.id,
        listing_id: listing.id,
        booked_slot_id: slotReservation.slotId,
        booking_flow: isInstantBook ? "instant_book" : "request_to_book",
        user_credit_applied_cents: String(userCreditAppliedCents),
        referral_credit_applied_cents: String(referralCreditAppliedCents),
      },
    }

    if (!isMockHost && host?.stripe_account_id && !isSelfBooking) {
      paymentIntentParams.transfer_data = {
        destination: host.stripe_account_id,
        amount: Math.round(fees.hostPayout * 100),
      }
    }

    console.log("[stripe/checkout] Creating PaymentIntent with params", paymentIntentParams)

    let paymentIntent: Stripe.Response<Stripe.PaymentIntent>
    try {
      paymentIntent = await stripe.paymentIntents.create(paymentIntentParams)
      console.log("[stripe/checkout] PaymentIntent created", {
        id: paymentIntent.id,
        status: paymentIntent.status,
        clientSecretPresent: Boolean(paymentIntent.client_secret),
        raw: paymentIntent,
      })
    } catch (stripeError) {
      await admin.from("bookings").update({ status: "cancelled" }).eq("id", booking.id)
      await admin.from("booked_slots").delete().eq("id", slotReservation.slotId)
      console.error("[stripe/checkout] PaymentIntent creation failed", stripeError)
      throw stripeError
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", booking.id)

    if (updateError) {
      console.error("[stripe/checkout] Booking update failed after PaymentIntent", {
        bookingId: booking.id,
        paymentIntentId: paymentIntent.id,
        updateError: updateError.message,
      })
      return NextResponse.json(
        { error: "Payment created, but booking update failed." },
        { status: 500 }
      )
    }

    const finalResponse = {
      clientSecret: paymentIntent.client_secret,
      bookingId: booking.id,
      appliedReferralCreditCents: referralCreditAppliedCents,
      appliedUserCreditCents: userCreditAppliedCents,
      guestTotalAfterCredit: fees.guestTotal,
    }
    console.log("[stripe/checkout] Sending successful response", finalResponse)
    return NextResponse.json(finalResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error"
    console.error("[stripe/checkout] Unhandled error response", { message, error })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
