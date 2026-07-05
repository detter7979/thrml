import { buildPlainText, renderThrmlEmail, type ThrmlEmailLayoutProps } from "@/lib/emails/render-layout"
import { sendEmail } from "@/lib/emails/send"
import { sendThrmlLayoutEmail, THRML_APP_URL } from "@/lib/emails/transactional-send"
import { createAdminClient } from "@/lib/supabase/admin"

import { emailAlreadySent, logEmailSent } from "./email-log"
import { DIGEST_SELECT, renderListingCardCompactHtml, type DigestListingRow } from "./weekly-digest"

const APP_URL = THRML_APP_URL

const EMAIL_BOOK_AGAIN = "guest_book_again"
const EMAIL_SAVED_NO_BOOKING = "guest_saved_no_booking"

const DAY_MS = 24 * 60 * 60 * 1000
const ACTIVE_BOOKING_STATUSES = ["confirmed", "pending_host", "completed"]

function firstName(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? "").trim()
  return trimmed ? (trimmed.split(/\s+/)[0] ?? "there") : "there"
}

async function emailForProfile(profileId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.auth.admin.getUserById(profileId)
  return data.user?.email ?? null
}

/**
 * "Book again" nudge ~7 days after a completed session, if the guest has
 * nothing upcoming. Deduped per booking.
 */
export async function processBookAgainNudges(): Promise<{ sent: number }> {
  const admin = createAdminClient()
  const now = new Date()
  const windowStart = new Date(now.getTime() - 10 * DAY_MS).toISOString().slice(0, 10)
  const windowEnd = new Date(now.getTime() - 6 * DAY_MS).toISOString().slice(0, 10)
  const today = now.toISOString().slice(0, 10)
  let sent = 0

  const { data: completedRaw } = await admin
    .from("bookings")
    .select("id, guest_id, listing_id, session_date")
    .eq("status", "completed")
    .gte("session_date", windowStart)
    .lte("session_date", windowEnd)

  const completed = completedRaw ?? []
  if (!completed.length) return { sent: 0 }

  const guestIds = Array.from(new Set(completed.map((b) => b.guest_id as string)))
  const { data: upcomingRaw } = await admin
    .from("bookings")
    .select("guest_id")
    .in("guest_id", guestIds)
    .in("status", ["confirmed", "pending_host"])
    .gte("session_date", today)

  const guestsWithUpcoming = new Set((upcomingRaw ?? []).map((b) => b.guest_id as string))
  const nudgedThisRun = new Set<string>()

  for (const booking of completed) {
    const guestId = booking.guest_id as string
    const bookingId = booking.id as string
    if (guestsWithUpcoming.has(guestId) || nudgedThisRun.has(guestId)) continue
    if (await emailAlreadySent(guestId, EMAIL_BOOK_AGAIN, bookingId)) continue

    const [{ data: profile }, { data: listing }] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", guestId).maybeSingle(),
      booking.listing_id
        ? admin.from("listings").select("id, title, is_active").eq("id", booking.listing_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const email = await emailForProfile(guestId)
    if (!email) continue

    const listingTitle = (listing?.title as string | null) ?? "your last session"
    const rebookUrl =
      listing?.is_active && listing?.id ? `${APP_URL}/listings/${listing.id}` : `${APP_URL}/explore`

    const result = await sendThrmlLayoutEmail({
      to: email,
      userId: guestId,
      preferenceKey: "marketing_offers",
      subject: "Ready for round two?",
      layout: {
        preview: `It's been a week since ${listingTitle} — keep the streak going`,
        kicker: "Book again",
        title: "One session feels good. A rhythm feels better.",
        greeting: `Hi ${firstName(profile?.full_name as string | null)},`,
        paragraphs: [
          `It's been about a week since your session at ${listingTitle}.`,
          "Regular heat and cold exposure is where the benefits compound — most regulars go weekly or biweekly.",
        ],
        cta: { label: "Book your next session", href: rebookUrl },
        footnote: `Prefer somewhere new? Browse spaces near you: ${APP_URL}/explore`,
      },
    })

    if (result.sent) {
      await logEmailSent(guestId, EMAIL_BOOK_AGAIN, bookingId)
      nudgedThisRun.add(guestId)
      sent++
    }
  }

  return { sent }
}

/**
 * Reminder for guests who saved spaces but never booked anything.
 * Sent once per user, 3+ days after their first save.
 */
export async function processSavedNoBookingReminders(): Promise<{ sent: number }> {
  const admin = createAdminClient()
  const now = new Date()
  const savedBefore = new Date(now.getTime() - 3 * DAY_MS).toISOString()
  const savedAfter = new Date(now.getTime() - 30 * DAY_MS).toISOString()
  let sent = 0

  const { data: savedRaw } = await admin
    .from("saved_listings")
    .select("user_id, listing_id, created_at")
    .gte("created_at", savedAfter)
    .lte("created_at", savedBefore)
    .order("created_at", { ascending: true })

  const saved = savedRaw ?? []
  if (!saved.length) return { sent: 0 }

  const savedByUser = new Map<string, string[]>()
  for (const row of saved) {
    const userId = row.user_id as string
    const listingId = row.listing_id as string
    const list = savedByUser.get(userId) ?? []
    if (!list.includes(listingId)) list.push(listingId)
    savedByUser.set(userId, list)
  }

  const userIds = Array.from(savedByUser.keys())
  const { data: bookingsRaw } = await admin
    .from("bookings")
    .select("guest_id")
    .in("guest_id", userIds)
    .in("status", ACTIVE_BOOKING_STATUSES)

  const usersWithBookings = new Set((bookingsRaw ?? []).map((b) => b.guest_id as string))

  for (const [userId, listingIds] of savedByUser) {
    if (usersWithBookings.has(userId)) continue
    if (await emailAlreadySent(userId, EMAIL_SAVED_NO_BOOKING)) continue

    const email = await emailForProfile(userId)
    if (!email) continue

    const [{ data: profile }, { data: listingsRaw2 }] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      admin
        .from("listings")
        .select(DIGEST_SELECT)
        .in("id", listingIds.slice(0, 6))
        .eq("is_active", true)
        .limit(3),
    ])

    const listings = (listingsRaw2 ?? []) as unknown as DigestListingRow[]
    if (!listings.length) continue

    const firstSaved = listings[0]
    const savedSummary = listings
      .map((l) => {
        const place = [l.city ?? l.location_city, l.state ?? l.location_state].filter(Boolean).join(", ")
        return place ? `${l.title} (${place})` : (l.title as string)
      })
      .filter(Boolean)

    const cardsHtml = listings.map((l) => renderListingCardCompactHtml(admin, l)).join("\n")

    const baseLayout: ThrmlEmailLayoutProps = {
      preview: "The spaces you saved are ready to book",
      kicker: "Your saved spaces",
      title: "You had good taste. Now take the plunge.",
      greeting: `Hi ${firstName(profile?.full_name as string | null)},`,
      paragraphs: [
        savedSummary.length > 1
          ? `You saved ${savedSummary.length} spaces on Thrml but haven't booked a session yet:`
          : "You saved a space on Thrml but haven't booked a session yet:",
      ],
      cta: { label: "Book a saved space", href: `${APP_URL}/dashboard/saved` },
      footnote: `Popular time slots go first — weekend mornings fill up early. Manage email preferences: ${APP_URL}/dashboard/account#notifications`,
      appUrl: APP_URL,
    }

    // Cards render in HTML only; plain text falls back to a titled list.
    const html = await renderThrmlEmail({ ...baseLayout, contentHtml: cardsHtml })
    const text = buildPlainText({ ...baseLayout, listItems: savedSummary })

    const result = await sendEmail({
      to: email,
      userId,
      preferenceKey: "marketing_offers",
      subject: `${firstSaved.title ?? "A space you saved"} is still waiting for you`,
      html,
      text,
    })

    if (result.sent) {
      await logEmailSent(userId, EMAIL_SAVED_NO_BOOKING)
      sent++
    }
  }

  return { sent }
}

export async function processGuestLifecycle(): Promise<{ sent: number }> {
  const [bookAgain, savedNoBooking] = await Promise.allSettled([
    processBookAgainNudges(),
    processSavedNoBookingReminders(),
  ])

  const sent =
    (bookAgain.status === "fulfilled" ? bookAgain.value.sent : 0) +
    (savedNoBooking.status === "fulfilled" ? savedNoBooking.value.sent : 0)

  if (bookAgain.status === "rejected") {
    console.error("[emails/guest-lifecycle] book-again failed", bookAgain.reason)
  }
  if (savedNoBooking.status === "rejected") {
    console.error("[emails/guest-lifecycle] saved-no-booking failed", savedNoBooking.reason)
  }

  return { sent }
}
