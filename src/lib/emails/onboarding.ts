import { sendEmail } from "@/lib/emails/send"
import { createAdminClient } from "@/lib/supabase/admin"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

function escapeHtml(v: string) {
  return v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function wrap(content: string) {
  return `
  <div style="background:#FAF7F4;padding:32px 16px;font-family:system-ui,Arial,sans-serif;color:#2C2420;">
    <div style="max-width:580px;margin:0 auto;background:#fff;border:1px solid #E9DED4;border-radius:14px;overflow:hidden;">
      <div style="background:#1A1410;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:0.1em;">THRML</span>
      </div>
      <div style="padding:28px 24px;">${content}</div>
      <div style="padding:14px 24px;border-top:1px solid #E9DED4;">
        <p style="margin:0;font-size:12px;color:#796A5E;">
          Thrml · <a href="${APP_URL}" style="color:#796A5E;">usethrml.com</a> ·
          <a href="${APP_URL}/dashboard/account#notifications" style="color:#796A5E;">Manage notifications</a> ·
          <a href="mailto:hello@usethrml.com" style="color:#796A5E;">hello@usethrml.com</a>
        </p>
      </div>
    </div>
  </div>`
}

function cta(label: string, url: string) {
  return `<p style="margin:22px 0 0;"><a href="${url}"
    style="display:inline-block;background:#C4623A;color:#fff;text-decoration:none;
           font-weight:700;font-size:15px;padding:12px 24px;border-radius:999px;"
  >${label}</a></p>`
}

// ─── Host welcome ──────────────────────────────────────────────────────────

export async function sendHostWelcomeEmail(args: {
  userId: string | null
  email: string
  firstName: string | null
}): Promise<{ sent: boolean; error?: string }> {
  const name = args.firstName ?? "there"
  const stripeUrl = `${APP_URL}/dashboard/account#house-rules`
  const listingUrl = `${APP_URL}/dashboard/listings/new`

  const html = wrap(`
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">Welcome to Thrml, ${escapeHtml(name)}.</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#3E3329;">
      You're now set up as a host. Here's how to get your first booking in 3 steps:
    </p>
    <ol style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.9;color:#3E3329;">
      <li><strong>Connect Stripe</strong> — so you can receive payouts the moment a booking confirms.</li>
      <li><strong>Create your first listing</strong> — add photos, set your price, and pick your access type.</li>
      <li><strong>Go live</strong> — publish and start accepting bookings instantly or by request.</li>
    </ol>
    ${cta("Connect Stripe & create your listing →", stripeUrl)}
    <p style="margin:16px 0 0;font-size:13px;color:#796A5E;">
      Or <a href="${listingUrl}" style="color:#C4623A;">create your listing first</a> — you can connect Stripe any time before your first payout.
    </p>
  `)

  const text = [
    `Welcome to Thrml, ${name}.`,
    "",
    "You're now set up as a host. Here's how to get your first booking in 3 steps:",
    "1. Connect Stripe — receive payouts automatically",
    "2. Create your first listing — photos, price, access type",
    "3. Go live — accept bookings instantly or by request",
    "",
    `Connect Stripe & create your listing: ${stripeUrl}`,
    `Or create your listing first: ${listingUrl}`,
  ].join("\n")

  return sendEmail({
    to: args.email,
    subject: `Welcome to Thrml — let's get your space live`,
    html,
    text,
    userId: args.userId,
    preferenceKey: "new_booking",
  })
}

// ─── Guest welcome ─────────────────────────────────────────────────────────

export async function sendGuestWelcomeEmail(args: {
  userId: string | null
  email: string
  firstName: string | null
}): Promise<{ sent: boolean; error?: string }> {
  const name = args.firstName ?? "there"
  const exploreUrl = `${APP_URL}/explore`

  const html = wrap(`
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">Welcome to Thrml, ${escapeHtml(name)}.</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#3E3329;">
      Private saunas, cold plunges, float tanks, and more — bookable by the hour, near you.
    </p>
    <p style="margin:0 0 6px;font-size:15px;font-weight:700;">Here's how it works:</p>
    <ol style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.9;color:#3E3329;">
      <li><strong>Find a space</strong> — filter by type, location, and availability.</li>
      <li><strong>Book instantly or send a request</strong> — some spaces are instant, others require host confirmation.</li>
      <li><strong>Read the house rules</strong> — every listing has access details and host instructions.</li>
      <li><strong>Arrive and enjoy</strong> — your access code arrives 2 hours before your session.</li>
    </ol>
    ${cta("Find wellness spaces near you →", exploreUrl)}
  `)

  const text = [
    `Welcome to Thrml, ${name}.`,
    "",
    "Private saunas, cold plunges, float tanks, and more — bookable by the hour, near you.",
    "",
    "1. Find a space — filter by type, location, and availability",
    "2. Book instantly or send a request",
    "3. Read the house rules",
    "4. Arrive and enjoy — access code arrives 2 hours before your session",
    "",
    `Find wellness spaces near you: ${exploreUrl}`,
  ].join("\n")

  return sendEmail({
    to: args.email,
    subject: `Welcome to Thrml — your first session awaits`,
    html,
    text,
    userId: args.userId,
    preferenceKey: "new_booking",
  })
}

// ─── Mark onboarding sent (idempotent) ────────────────────────────────────

export async function markOnboardingEmailSent(userId: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from("profiles")
    .update({ onboarding_email_sent: true })
    .eq("id", userId)
    .eq("onboarding_email_sent", false)
}
