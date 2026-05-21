import { sendThrmlLayoutEmail, THRML_APP_URL } from "@/lib/emails/transactional-send"
import { createAdminClient } from "@/lib/supabase/admin"

const APP_URL = THRML_APP_URL

export async function sendHostWelcomeEmail(args: {
  userId: string | null
  email: string
  firstName: string | null
}): Promise<{ sent: boolean; error?: string }> {
  const name = args.firstName ?? "there"
  const stripeUrl = `${APP_URL}/dashboard/account#house-rules`
  const listingUrl = `${APP_URL}/dashboard/listings/new`

  return sendThrmlLayoutEmail({
    to: args.email,
    subject: `Welcome to Thrml — let's get your space live`,
    userId: args.userId,
    preferenceKey: "new_booking",
    layout: {
      preview: "Welcome to Thrml — let's get your space live",
      kicker: "Welcome",
      title: `Welcome to Thrml, ${name}.`,
      paragraphs: ["You're now set up as a host. Here's how to get your first booking in 3 steps:"],
      listItems: [
        "Connect Stripe — so you can receive payouts the moment a booking confirms.",
        "Create your first listing — add photos, set your price, and pick your access type.",
        "Go live — publish and start accepting bookings instantly or by request.",
      ],
      cta: { label: "Connect Stripe & create your listing", href: stripeUrl },
      footnote: `Or create your listing first at ${listingUrl} — you can connect Stripe any time before your first payout.`,
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
