import { sendThrmlLayoutEmail, THRML_APP_URL } from "@/lib/emails/transactional-send"
import { createAdminClient } from "@/lib/supabase/admin"

import { emailAlreadySent, logEmailSent } from "./email-log"

const APP_URL = THRML_APP_URL
const ACCOUNT_IDENTITY_URL = `${APP_URL}/dashboard/account#identity`

const EMAIL_VERIFIED = "host_identity_verified"
const EMAIL_REQUIRES_INPUT = "host_identity_requires_input"
const EMAIL_FOLLOWUP_PENDING = "host_identity_followup_pending"
const EMAIL_FOLLOWUP_CANCELED = "host_identity_followup_canceled"

const PENDING_STALE_MS = 24 * 60 * 60 * 1000

function firstName(fullName: string | null | undefined) {
  const trimmed = (fullName ?? "").trim()
  if (!trimmed) return "there"
  return trimmed.split(/\s+/)[0] ?? "there"
}

async function hostEmailForProfile(profileId: string) {
  const admin = createAdminClient()
  const { data: authUser } = await admin.auth.admin.getUserById(profileId)
  return authUser.user?.email ?? null
}

/** Sent once when Stripe Identity verification succeeds. */
export async function sendHostIdentityVerifiedEmail(args: {
  profileId: string
  fullName: string | null
}): Promise<{ sent: boolean; error?: string }> {
  if (await emailAlreadySent(args.profileId, EMAIL_VERIFIED)) {
    return { sent: false, error: "Already sent" }
  }

  const email = await hostEmailForProfile(args.profileId)
  if (!email) return { sent: false, error: "Missing host email" }

  const name = firstName(args.fullName)
  const result = await sendThrmlLayoutEmail({
    to: email,
    userId: args.profileId,
    preferenceKey: "new_booking",
    subject: "You're verified — your Verified Host badge is live",
    layout: {
      preview: "Your Verified Host badge is now live on your listings",
      kicker: "Identity verified",
      title: `You're verified, ${name}.`,
      paragraphs: [
        "You completed government-issued ID verification through Stripe, our payments partner.",
        "Your Verified Host badge now appears on your listings. It confirms your identity — it does not verify the safety, quality, or condition of your space.",
        "Guests can hover the badge to see what verification means. Thank you for helping build trust on thrml.",
      ],
      cta: { label: "View your dashboard", href: `${APP_URL}/dashboard/listings` },
      footnote: `Questions? Visit ${APP_URL}/faq or email hello@usethrml.com.`,
    },
  })

  if (result.sent) {
    await logEmailSent(args.profileId, EMAIL_VERIFIED)
  }
  return result
}

/** Sent when Stripe needs more information (once per profile). */
export async function sendHostIdentityRequiresInputEmail(args: {
  profileId: string
  fullName: string | null
}): Promise<{ sent: boolean; error?: string }> {
  if (await emailAlreadySent(args.profileId, EMAIL_REQUIRES_INPUT)) {
    return { sent: false, error: "Already sent" }
  }

  const email = await hostEmailForProfile(args.profileId)
  if (!email) return { sent: false, error: "Missing host email" }

  const name = firstName(args.fullName)
  const result = await sendThrmlLayoutEmail({
    to: email,
    userId: args.profileId,
    preferenceKey: "new_booking",
    subject: "Action needed — finish your identity verification",
    layout: {
      preview: "We need a bit more information to verify your identity",
      kicker: "Verification",
      title: "We need a bit more information.",
      greeting: `Hi ${name},`,
      paragraphs: [
        "Stripe couldn't complete your identity verification with the details provided so far.",
        "This usually takes just a few minutes — have your government-issued ID ready and use the same legal name as on your account.",
      ],
      cta: { label: "Continue verification", href: ACCOUNT_IDENTITY_URL },
      footnote: "If you have trouble, reply to this email or contact hello@usethrml.com.",
    },
  })

  if (result.sent) {
    await logEmailSent(args.profileId, EMAIL_REQUIRES_INPUT)
  }
  return result
}

/** Reminder when verification was started but not finished (pending > 24h). */
async function sendHostIdentityPendingFollowUp(args: {
  profileId: string
  fullName: string | null
}): Promise<{ sent: boolean; error?: string }> {
  if (await emailAlreadySent(args.profileId, EMAIL_FOLLOWUP_PENDING)) {
    return { sent: false, error: "Already sent" }
  }

  const email = await hostEmailForProfile(args.profileId)
  if (!email) return { sent: false, error: "Missing host email" }

  const name = firstName(args.fullName)
  const result = await sendThrmlLayoutEmail({
    to: email,
    userId: args.profileId,
    preferenceKey: "new_booking",
    subject: "Finish verifying your host identity",
    layout: {
      preview: "Pick up where you left off — verify your identity",
      kicker: "Verification",
      title: "You're almost there.",
      greeting: `Hi ${name},`,
      paragraphs: [
        "You started identity verification but didn't finish. Verified hosts get a trust badge on their listings.",
        "It only takes a few minutes, and you can complete it on your phone.",
      ],
      cta: { label: "Continue verification", href: ACCOUNT_IDENTITY_URL },
    },
  })

  if (result.sent) {
    await logEmailSent(args.profileId, EMAIL_FOLLOWUP_PENDING)
  }
  return result
}

/** Reminder when the Stripe session was canceled before completion. */
async function sendHostIdentityCanceledFollowUp(args: {
  profileId: string
  fullName: string | null
}): Promise<{ sent: boolean; error?: string }> {
  if (await emailAlreadySent(args.profileId, EMAIL_FOLLOWUP_CANCELED)) {
    return { sent: false, error: "Already sent" }
  }

  const email = await hostEmailForProfile(args.profileId)
  if (!email) return { sent: false, error: "Missing host email" }

  const name = firstName(args.fullName)
  const result = await sendThrmlLayoutEmail({
    to: email,
    userId: args.profileId,
    preferenceKey: "new_booking",
    subject: "Finish verifying your host identity",
    layout: {
      preview: "Complete identity verification to unlock your Verified Host badge",
      kicker: "Verification",
      title: "Your verification wasn't completed.",
      greeting: `Hi ${name},`,
      paragraphs: [
        "Your last identity verification session didn't finish. When you're ready, you can start again from your account.",
        "Verified hosts display a badge on their listings after government-issued ID verification through Stripe.",
      ],
      cta: { label: "Verify your identity", href: ACCOUNT_IDENTITY_URL },
    },
  })

  if (result.sent) {
    await logEmailSent(args.profileId, EMAIL_FOLLOWUP_CANCELED)
  }
  return result
}

/** Cron: follow up on abandoned or stale identity verification (deduped via email_log). */
export async function processHostIdentityFollowUps(): Promise<{ sent: number }> {
  const admin = createAdminClient()
  const staleBefore = new Date(Date.now() - PENDING_STALE_MS).toISOString()
  let sent = 0

  const { data: pendingHosts } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("is_host", true)
    .eq("id_verified", false)
    .eq("id_verification_status", "pending")
    .not("id_verification_started_at", "is", null)
    .lt("id_verification_started_at", staleBefore)

  for (const row of pendingHosts ?? []) {
    const id = typeof row.id === "string" ? row.id : null
    if (!id) continue
    const result = await sendHostIdentityPendingFollowUp({
      profileId: id,
      fullName: typeof row.full_name === "string" ? row.full_name : null,
    })
    if (result.sent) sent++
  }

  const { data: canceledHosts } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("is_host", true)
    .eq("id_verified", false)
    .eq("id_verification_status", "canceled")

  for (const row of canceledHosts ?? []) {
    const id = typeof row.id === "string" ? row.id : null
    if (!id) continue
    const result = await sendHostIdentityCanceledFollowUp({
      profileId: id,
      fullName: typeof row.full_name === "string" ? row.full_name : null,
    })
    if (result.sent) sent++
  }

  return { sent }
}
