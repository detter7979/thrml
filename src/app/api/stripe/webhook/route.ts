import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import { sendAccessCode } from "@/lib/access/send-access-code"
import {
  sendAutomatedBookingConfirmedMessage,
  sendAutomatedBookingRequestSentMessage,
} from "@/lib/automated-messages"
import {
  sendGuestBookingRequestReceivedEmail,
  sendGuestBookingConfirmedEmail,
  sendHostBookingRequestEmail,
  sendHostBookingConfirmedEmail,
} from "@/lib/emails"
import { sendPostSessionEmails } from "@/lib/emails/post-session"
import { sendGA4Event } from "@/lib/analytics/measurement-protocol"
import { normalizeNotificationPreferences } from "@/lib/notification-preferences"
import { createAdminClient } from "@/lib/supabase/admin"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

function isCodeAccessType(value: unknown) {
  return (
    typeof value === "string" &&
    ["code", "lockbox", "smart_lock"].includes(value.trim().toLowerCase())
  )
}

export async function POST(req: NextRequest) {
  console.log("[stripe/webhook] Incoming webhook request")
  const body = await req.text()
  const sig = req.headers.get("stripe-signature")

  if (!sig) {
    console.log("[stripe/webhook] Missing stripe signature header")
    return NextResponse.json({ error: "Missing stripe signature." }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    console.error("[stripe/webhook] Invalid signature during constructEvent")
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  console.log("[stripe/webhook] Event received", {
    type: event.type,
    id: event.id,
  })
  const supportedEvents = new Set([
    "checkout.session.completed",
    "payment_intent.succeeded",
    "payment_intent.amount_capturable_updated",
    "payment_intent.payment_failed",
    "payment_intent.canceled",
    "account.updated",
  ])
  if (!supportedEvents.has(event.type)) {
    console.log("[stripe/webhook] Ignoring unsupported event type", {
      type: event.type,
      id: event.id,
    })
    return NextResponse.json({ received: true })
  }

  const supabase = createAdminClient()

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent
    const bookingId = pi.metadata.booking_id ?? pi.metadata.bookingId
    const newsletterOptIn =
      pi.metadata.newsletterOptIn === "true" || pi.metadata.newsletter_opt_in === "true"

    console.log("[stripe/webhook] payment_intent.succeeded", {
      paymentIntentId: pi.id,
      paymentIntentStatus: pi.status,
      bookingId,
      metadata: pi.metadata,
    })

    if (bookingId) {
      const { data: booking } = await supabase
        .from("bookings")
        .select(
          "id, status, access_code, listing_id, guest_id, host_id, session_date, start_time, end_time, duration_hours, guest_count, total_charged, host_payout, automated_messages_sent"
        )
        .eq("id", bookingId)
        .maybeSingle()

      console.log("[stripe/webhook] Booking lookup result", {
        bookingFound: Boolean(booking?.id),
        bookingId,
      })

      const { data: statusTransition, error: bookingUpdateError } = await supabase
        .from("bookings")
        .update({
          status: "confirmed",
          waiver_accepted: true,
          waiver_accepted_at: new Date().toISOString(),
        })
        .eq("id", bookingId)
        .neq("status", "confirmed")
        .select("id")
        .maybeSingle()

      await supabase
        .from("booked_slots")
        .update({ status: "confirmed" })
        .eq("booking_id", bookingId)

      console.log("[stripe/webhook] Booking status update attempted", {
        bookingId,
        targetStatus: "confirmed",
        bookingUpdateError: bookingUpdateError?.message ?? null,
      })

      if (bookingUpdateError) {
        console.error("[stripe/webhook] Failed to confirm booking", {
          bookingId,
          paymentIntentId: pi.id,
          error: bookingUpdateError.message,
        })
      }

      const newlyConfirmed = Boolean(statusTransition?.id)
      if (booking && !newlyConfirmed) {
        console.log("[stripe/webhook] Booking already confirmed; running idempotent post-confirm checks", {
          bookingId: booking.id,
          paymentIntentId: pi.id,
        })
      }

      if (!bookingUpdateError && booking?.id && booking.guest_id && booking.host_id && booking.listing_id) {
        const tags = new Set(booking.automated_messages_sent ?? [])
        const [{ data: listing }, { data: guestProfile }, { data: hostProfile }] = await Promise.all([
          supabase
            .from("listings")
            .select(
              "id, title, service_type, access_type, access_instructions, access_code_send_timing, city, state, cancellation_policy"
            )
            .eq("id", booking.listing_id)
            .maybeSingle(),
          supabase.from("profiles").select("id, full_name").eq("id", booking.guest_id).maybeSingle(),
          supabase.from("profiles").select("id, full_name").eq("id", booking.host_id).maybeSingle(),
        ])

        const [hostAuthUser, guestAuthUser] = await Promise.all([
          supabase.auth.admin.getUserById(booking.host_id),
          supabase.auth.admin.getUserById(booking.guest_id),
        ])
        const hostEmail = hostAuthUser.data.user?.email ?? null
        const guestEmail = guestAuthUser.data.user?.email ?? null
        const listingAccessType = (listing as Record<string, unknown> | null)?.access_type ?? null
        const shouldIncludeCode = isCodeAccessType(listingAccessType) && Boolean(booking.access_code)

        // Server-side GA4 purchase — fires for all users including iOS/Safari.
        if (newlyConfirmed) {
          void sendGA4Event({
            // Use guest_id as a stable client_id — GA4 MP requires one.
            clientId: booking.guest_id,
            events: [
              {
                name: "purchase",
                params: {
                  event_id: `purchase_${booking.id}`,
                  transaction_id: booking.id,
                  value: Number(booking.total_charged ?? 0),
                  currency: "USD",
                  items: [
                    {
                      item_id: booking.listing_id,
                      item_name:
                        ((listing as Record<string, unknown> | null)?.title as string | null) ?? "Thrml Session",
                      item_category:
                        ((listing as Record<string, unknown> | null)?.service_type as string | null) ?? "wellness",
                      price: Number(booking.total_charged ?? 0),
                      quantity: 1,
                    },
                  ],
                },
              },
            ],
          })
        }

        if (newsletterOptIn) {
          const { data: guestPrefsProfile } = await supabase
            .from("profiles")
            .select("notification_preferences")
            .eq("id", booking.guest_id)
            .maybeSingle()

          const mergedPrefs = normalizeNotificationPreferences({
            ...(guestPrefsProfile?.notification_preferences &&
            typeof guestPrefsProfile.notification_preferences === "object"
              ? (guestPrefsProfile.notification_preferences as Record<string, unknown>)
              : {}),
            marketing_wellness_tips: true,
          })

          await supabase
            .from("profiles")
            .update({
              newsletter_opted_in: true,
              newsletter_opted_in_at: new Date().toISOString(),
              notification_preferences: mergedPrefs,
            })
            .eq("id", booking.guest_id)
        }

        if (!tags.has("booking_confirmed_message")) {
          try {
            await sendAutomatedBookingConfirmedMessage({
              bookingId: booking.id,
              listingId: booking.listing_id,
              guestId: booking.guest_id,
              hostId: booking.host_id,
            })
            tags.add("booking_confirmed_message")
            console.log("[stripe/webhook] Confirmation message sent", { bookingId: booking.id })
          } catch (messageError) {
            const message = messageError instanceof Error ? messageError.message : "Unknown message error"
            console.error("[stripe/webhook] Non-blocking message send failure", {
              bookingId: booking.id,
              error: message,
            })
          }
        }

        if (!tags.has("booking_confirmed_host_email") || !tags.has("booking_confirmed_guest_email")) {
          const [hostEmailResult, guestEmailResult] = await Promise.all([
            tags.has("booking_confirmed_host_email")
              ? Promise.resolve({ sent: true as const })
              : sendHostBookingConfirmedEmail({
              booking_id: booking.id,
              guest_id: booking.guest_id,
              host_id: booking.host_id,
              listing_title: (listing as Record<string, unknown> | null)?.title as string | null,
              listing_access_type: typeof listingAccessType === "string" ? listingAccessType : null,
              listing_access_instructions:
                typeof (listing as Record<string, unknown> | null)?.access_instructions === "string"
                  ? ((listing as Record<string, unknown>).access_instructions as string)
                  : null,
              listing_location_label: [
                (listing as Record<string, unknown> | null)?.city,
                (listing as Record<string, unknown> | null)?.state,
              ]
                .filter((part): part is string => typeof part === "string" && part.length > 0)
                .join(", "),
              listing_cancellation_policy:
                typeof (listing as Record<string, unknown> | null)?.cancellation_policy === "string"
                  ? ((listing as Record<string, unknown>).cancellation_policy as string)
                  : null,
              session_date: booking.session_date ?? null,
              start_time: booking.start_time ?? null,
              end_time: booking.end_time ?? null,
              duration_hours: Number(booking.duration_hours ?? 1),
              guest_count: Number(booking.guest_count ?? 1),
              total_charged: Number(booking.total_charged ?? 0),
              host_payout: Number(booking.host_payout ?? 0),
              access_code: shouldIncludeCode ? booking.access_code : null,
              guest_name: guestProfile?.full_name ?? null,
              guest_email: guestEmail,
              host_name: hostProfile?.full_name ?? null,
              host_email: hostEmail,
            }),
            tags.has("booking_confirmed_guest_email")
              ? Promise.resolve({ sent: true as const })
              : sendGuestBookingConfirmedEmail({
              booking_id: booking.id,
              guest_id: booking.guest_id,
              host_id: booking.host_id,
              listing_title: (listing as Record<string, unknown> | null)?.title as string | null,
              listing_access_type: typeof listingAccessType === "string" ? listingAccessType : null,
              listing_access_code_send_timing:
                typeof (listing as Record<string, unknown> | null)?.access_code_send_timing === "string"
                  ? ((listing as Record<string, unknown>).access_code_send_timing as string)
                  : null,
              listing_access_instructions:
                typeof (listing as Record<string, unknown> | null)?.access_instructions === "string"
                  ? ((listing as Record<string, unknown>).access_instructions as string)
                  : null,
              listing_location_label: [
                (listing as Record<string, unknown> | null)?.city,
                (listing as Record<string, unknown> | null)?.state,
              ]
                .filter((part): part is string => typeof part === "string" && part.length > 0)
                .join(", "),
              listing_cancellation_policy:
                typeof (listing as Record<string, unknown> | null)?.cancellation_policy === "string"
                  ? ((listing as Record<string, unknown>).cancellation_policy as string)
                  : null,
              session_date: booking.session_date ?? null,
              start_time: booking.start_time ?? null,
              end_time: booking.end_time ?? null,
              duration_hours: Number(booking.duration_hours ?? 1),
              guest_count: Number(booking.guest_count ?? 1),
              total_charged: Number(booking.total_charged ?? 0),
              host_payout: Number(booking.host_payout ?? 0),
              access_code: shouldIncludeCode ? booking.access_code : null,
              guest_name: guestProfile?.full_name ?? null,
              guest_email: guestEmail,
              host_name: hostProfile?.full_name ?? null,
              host_email: hostEmail,
            }),
          ])
          if (hostEmailResult.sent) {
            tags.add("booking_confirmed_host_email")
          } else {
            console.warn("[stripe/webhook] Host booking confirmation email not sent", {
              bookingId: booking.id,
              error: hostEmailResult.error ?? "Unknown host confirmation email error",
            })
          }
          if (guestEmailResult.sent) {
            tags.add("booking_confirmed_guest_email")
          } else {
            console.warn("[stripe/webhook] Guest booking confirmation email not sent", {
              bookingId: booking.id,
              error: guestEmailResult.error ?? "Unknown guest confirmation email error",
            })
          }
        }

        if (tags.size !== (booking.automated_messages_sent ?? []).length) {
          await supabase
            .from("bookings")
            .update({ automated_messages_sent: Array.from(tags) })
            .eq("id", booking.id)
        }

        const timing =
          typeof (listing as Record<string, unknown> | null)?.access_code_send_timing === "string"
            ? ((listing as Record<string, unknown>).access_code_send_timing as string)
            : null
        if (timing === "on_confirm") {
          void sendAccessCode(booking.id)
        } else if (timing === "24h_before" || timing === "1h_before") {
          console.log("[stripe/webhook] Access code queued for cron send", { bookingId: booking.id, timing })
        }
      }
    }
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session
    const bookingId = session.metadata?.booking_id ?? session.metadata?.bookingId
    if (bookingId) {
      const { data: booking } = await supabase
        .from("bookings")
        .select(
          "id, guest_id, host_id, session_date, end_time, host_payout, post_session_email_sent, listings(id, title, service_type)"
        )
        .eq("id", bookingId)
        .maybeSingle()

      if (booking?.id && !booking.post_session_email_sent) {
        const [guestProfile, hostProfile] = await Promise.all([
          supabase.from("profiles").select("full_name").eq("id", booking.guest_id).maybeSingle(),
          supabase.from("profiles").select("full_name").eq("id", booking.host_id).maybeSingle(),
        ])
        const [guestAuth, hostAuth] = await Promise.all([
          supabase.auth.admin.getUserById(booking.guest_id),
          supabase.auth.admin.getUserById(booking.host_id),
        ])

        const sessionEnd = booking.end_time
          ? new Date(`${booking.session_date ?? ""}T${booking.end_time}`)
          : null
        const now = new Date()
        if (sessionEnd && !Number.isNaN(sessionEnd.getTime()) && now >= sessionEnd) {
          await sendPostSessionEmails({
            id: booking.id,
            guest_id: booking.guest_id,
            host_id: booking.host_id,
            host_payout: Number(booking.host_payout ?? 0),
            post_session_email_sent: booking.post_session_email_sent,
            listings: Array.isArray(booking.listings)
              ? (booking.listings[0] ?? null)
              : (booking.listings as { id: string; title: string | null; service_type: string | null } | null),
            guest_profile: {
              full_name: guestProfile.data?.full_name ?? null,
              email: guestAuth.data.user?.email ?? null,
            },
            host_profile: {
              full_name: hostProfile.data?.full_name ?? null,
              email: hostAuth.data.user?.email ?? null,
            },
          })
        }
      }
    }
  }

  if (event.type === "payment_intent.amount_capturable_updated") {
    const pi = event.data.object as Stripe.PaymentIntent
    const bookingId = pi.metadata.booking_id ?? pi.metadata.bookingId
    if (bookingId) {
      const { data: booking } = await supabase
        .from("bookings")
        .select(
          "id, status, listing_id, guest_id, host_id, session_date, start_time, end_time, duration_hours, guest_count, total_charged, host_payout, confirmation_deadline, automated_messages_sent"
        )
        .eq("id", bookingId)
        .maybeSingle()

      if (booking?.id && booking.status === "pending_host" && booking.guest_id && booking.host_id && booking.listing_id) {
        const tags = new Set(booking.automated_messages_sent ?? [])
        if (!tags.has("request_to_book_notified")) {
          const confirmationDeadline =
            booking.confirmation_deadline ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          if (!booking.confirmation_deadline) {
            await supabase
              .from("bookings")
              .update({ confirmation_deadline: confirmationDeadline })
              .eq("id", booking.id)
          }

          const [{ data: listing }, { data: guestProfile }, { data: hostProfile }] = await Promise.all([
            supabase
              .from("listings")
              .select("id, title, service_type")
              .eq("id", booking.listing_id)
              .maybeSingle(),
            supabase.from("profiles").select("id, full_name").eq("id", booking.guest_id).maybeSingle(),
            supabase.from("profiles").select("id, full_name").eq("id", booking.host_id).maybeSingle(),
          ])

          const [hostAuthUser, guestAuthUser] = await Promise.all([
            supabase.auth.admin.getUserById(booking.host_id),
            supabase.auth.admin.getUserById(booking.guest_id),
          ])

          const [hostRequestResult, guestRequestResult, automatedMessageResult] = await Promise.allSettled([
            sendHostBookingRequestEmail({
              booking_id: booking.id,
              listing_title: (listing as Record<string, unknown> | null)?.title as string | null,
              listing_id: booking.listing_id,
              service_type: (listing as Record<string, unknown> | null)?.service_type as string | null,
              session_date: booking.session_date ?? null,
              start_time: booking.start_time ?? null,
              end_time: booking.end_time ?? null,
              guest_count: Number(booking.guest_count ?? 1),
              total_charged: Number(booking.total_charged ?? 0),
              host_payout: Number(booking.host_payout ?? 0),
              guest_id: booking.guest_id,
              guest_name: guestProfile?.full_name ?? null,
              guest_email: guestAuthUser.data.user?.email ?? null,
              host_id: booking.host_id,
              host_name: hostProfile?.full_name ?? null,
              host_email: hostAuthUser.data.user?.email ?? null,
              confirmation_deadline: confirmationDeadline,
            }),
            sendGuestBookingRequestReceivedEmail({
              booking_id: booking.id,
              listing_title: (listing as Record<string, unknown> | null)?.title as string | null,
              listing_id: booking.listing_id,
              service_type: (listing as Record<string, unknown> | null)?.service_type as string | null,
              session_date: booking.session_date ?? null,
              start_time: booking.start_time ?? null,
              end_time: booking.end_time ?? null,
              guest_count: Number(booking.guest_count ?? 1),
              total_charged: Number(booking.total_charged ?? 0),
              host_payout: Number(booking.host_payout ?? 0),
              guest_id: booking.guest_id,
              guest_name: guestProfile?.full_name ?? null,
              guest_email: guestAuthUser.data.user?.email ?? null,
              host_id: booking.host_id,
              host_name: hostProfile?.full_name ?? null,
              host_email: hostAuthUser.data.user?.email ?? null,
              confirmation_deadline: confirmationDeadline,
            }),
            sendAutomatedBookingRequestSentMessage({
              bookingId: booking.id,
              listingId: booking.listing_id,
              listingTitle:
                ((listing as Record<string, unknown> | null)?.title as string | null) ?? "your session",
              guestId: booking.guest_id,
              hostId: booking.host_id,
              hostName: hostProfile?.full_name?.split(" ")[0] ?? "your host",
              sessionDateLabel: booking.session_date
                ? new Intl.DateTimeFormat("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  }).format(new Date(`${booking.session_date}T12:00:00`))
                : "your selected date",
            }),
          ])
          const hostRequestSent =
            hostRequestResult.status === "fulfilled" && Boolean(hostRequestResult.value?.sent)
          const guestRequestSent =
            guestRequestResult.status === "fulfilled" && Boolean(guestRequestResult.value?.sent)
          const automatedMessageSent = automatedMessageResult.status === "fulfilled"

          if (hostRequestSent && guestRequestSent && automatedMessageSent) {
            tags.add("request_to_book_notified")
            await supabase
              .from("bookings")
              .update({ automated_messages_sent: Array.from(tags) })
              .eq("id", booking.id)
          } else {
            console.warn("[stripe/webhook] Request-to-book notifications incomplete; will not mark as sent", {
              bookingId: booking.id,
              hostRequestSent,
              guestRequestSent,
              automatedMessageSent,
              hostRequestError:
                hostRequestResult.status === "fulfilled"
                  ? hostRequestResult.value?.error ?? null
                  : hostRequestResult.reason instanceof Error
                    ? hostRequestResult.reason.message
                    : String(hostRequestResult.reason),
              guestRequestError:
                guestRequestResult.status === "fulfilled"
                  ? guestRequestResult.value?.error ?? null
                  : guestRequestResult.reason instanceof Error
                    ? guestRequestResult.reason.message
                    : String(guestRequestResult.reason),
              automatedMessageError:
                automatedMessageResult.status === "fulfilled"
                  ? null
                  : automatedMessageResult.reason instanceof Error
                    ? automatedMessageResult.reason.message
                    : String(automatedMessageResult.reason),
            })
          }
        }
      }
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent
    console.log("[stripe/webhook] payment_intent.payment_failed", {
      paymentIntentId: pi.id,
      paymentIntentStatus: pi.status,
      metadata: pi.metadata,
    })
    await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("stripe_payment_intent_id", pi.id)

    await supabase
      .from("booked_slots")
      .delete()
      .eq("booking_id", pi.metadata.booking_id ?? pi.metadata.bookingId ?? "")
  }

  if (event.type === "payment_intent.canceled") {
    const pi = event.data.object as Stripe.PaymentIntent
    await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("stripe_payment_intent_id", pi.id)

    await supabase
      .from("booked_slots")
      .delete()
      .eq("booking_id", pi.metadata.booking_id ?? pi.metadata.bookingId ?? "")
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account
    console.log("[stripe/webhook] account.updated", {
      accountId: account.id,
      detailsSubmitted: account.details_submitted,
      payoutsEnabled: account.payouts_enabled,
      chargesEnabled: account.charges_enabled,
    })
    await supabase
      .from("profiles")
      .update({
        stripe_onboarding_complete: Boolean(account.details_submitted),
        stripe_payouts_enabled: Boolean(account.payouts_enabled),
        stripe_charges_enabled: Boolean(account.charges_enabled),
        stripe_connect_updated_at: new Date().toISOString(),
      })
      .eq("stripe_account_id", account.id)
  }

  console.log("[stripe/webhook] Webhook request handled successfully")
  return NextResponse.json({ received: true })
}
