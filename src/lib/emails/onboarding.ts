import { sendThrmlLayoutEmail, THRML_APP_URL } from "@/lib/emails/transactional-send"
import { guestBookingsOpen } from "@/lib/host/host-funnel"
import { createAdminClient } from "@/lib/supabase/admin"

const APP_URL = THRML_APP_URL

export async function sendHostWelcomeEmail(args: {
  userId: string | null
  email: string
  firstName: string | null
}): Promise<{ sent: boolean; error?: string }> {
  const name = args.firstName ?? "there"
  const listingUrl = `${APP_URL}/become-a-host?resume=1`
  const payoutsUrl = `${APP_URL}/dashboard/account#payout-settings`
  const open = guestBookingsOpen()

  return sendThrmlLayoutEmail({
    to: args.email,
    subject: `Welcome to thrml — let's get your space live`,
    userId: args.userId,
    preferenceKey: "new_booking",
    layout: {
      preview: "Welcome to thrml — let's get your space live",
      kicker: "Welcome",
      title: `Welcome to thrml, ${name}.`,
      paragraphs: [
        open
          ? "You're set up as a host. Here's how to get your first booking:"
          : "You're joining as one of our founding hosts in the Seattle area. Here's how to get ready before we open guest bookings:",
      ],
      listItems: [
        "List your space — a few photos (3+), your price per session and your hours. Saunas, cold plunges, hot tubs and float tanks are all welcome.",
        "Verify your identity — it earns the Verified Host badge guests look for.",
        "Connect Stripe payouts — so you're paid automatically after every session.",
      ],
      cta: { label: "List my space", href: listingUrl },
      footnote: `Already listed? Connect payouts anytime at ${payoutsUrl}. Questions? Just reply to this email.`,
    },
  })
}

export async function sendGuestWelcomeEmail(args: {
  userId: string | null
  email: string
  firstName: string | null
}): Promise<{ sent: boolean; error?: string }> {
  const name = args.firstName ?? "there"
  const exploreUrl = `${APP_URL}/explore`

  return sendThrmlLayoutEmail({
    to: args.email,
    subject: `Welcome to Thrml — your first session awaits`,
    userId: args.userId,
    preferenceKey: "new_booking",
    layout: {
      preview: "Welcome to Thrml — your first session awaits",
      kicker: "Welcome",
      title: `Welcome to Thrml, ${name}.`,
      paragraphs: [
        "Private saunas, cold plunges, float tanks, and more — bookable by the hour, near you.",
        "Here's how it works:",
      ],
      listItems: [
        "Find a space — filter by type, location, and availability.",
        "Book instantly or send a request — some spaces are instant, others require host confirmation.",
        "Read the house rules — every listing has access details and host instructions.",
        "Arrive and enjoy — your access code arrives 2 hours before your session.",
      ],
      cta: { label: "Find wellness spaces near you", href: exploreUrl },
    },
  })
}

export async function markOnboardingEmailSent(userId: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from("profiles")
    .update({ onboarding_email_sent: true })
    .eq("id", userId)
    .eq("onboarding_email_sent", false)
}
