import type { SupabaseClient } from "@supabase/supabase-js"

import { renderThrmlEmailPair } from "@/lib/emails/render-layout"
import { sendEmail } from "@/lib/emails/send"
import { THRML_APP_URL } from "@/lib/emails/transactional-send"
import { createAdminClient } from "@/lib/supabase/admin"

import { emailAlreadySent, logEmailSent } from "./email-log"

const APP_URL = THRML_APP_URL
const EMAIL_TYPE = "biweekly_newsletter"

/** Monday anchor for fortnight counting (any past Monday works). */
const FORTNIGHT_EPOCH_UTC = Date.UTC(2026, 0, 5)
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export type NewsletterEdition = {
  subject: string
  heroHeadline: string
  heroSubline: string
  paragraphs: string[]
  facts: string[]
}

/**
 * Rotating content bank. Editions cycle in order, one per fortnight,
 * so the sequence repeats roughly twice a year.
 */
export const NEWSLETTER_EDITIONS: NewsletterEdition[] = [
  {
    subject: "Why 20 minutes of heat changes your whole week",
    heroHeadline: "Sweat. Recover. Repeat.",
    heroSubline: "The case for making sauna a weekly ritual, not a treat.",
    paragraphs: [
      "Regular sauna use is one of the best-studied wellness habits in the world — and the research keeps getting better.",
    ],
    facts: [
      "Finnish cohort studies associate 2–3 sauna sessions per week with meaningfully lower cardiovascular risk.",
      "A single 20-minute session at 175°F+ can elevate heart rate similar to moderate exercise.",
      "Heat exposure triggers heat-shock proteins — your cells' own repair crew.",
    ],
  },
  {
    subject: "Cold plunge, explained: what 3 minutes actually does",
    heroHeadline: "Three minutes. Total reset.",
    heroSubline: "What cold water immersion really does to your brain and body.",
    paragraphs: [
      "The gasp, the clarity, the calm afterwards — cold immersion has a physiology all its own.",
    ],
    facts: [
      "Cold water immersion can raise norepinephrine and dopamine significantly — the post-plunge mood lift is chemical, not placebo.",
      "Most protocols land between 2–5 minutes at 50–59°F. Longer isn't better; consistent is better.",
      "Contrast therapy — heat then cold — is how Nordic bathers have done it for centuries.",
    ],
  },
  {
    subject: "The sleep upgrade hiding in your evening sauna",
    heroHeadline: "Better nights start with heat.",
    heroSubline: "How an evening session sets up deeper sleep.",
    paragraphs: [
      "The post-sauna cooldown mimics the natural temperature drop that signals your body it's time to sleep.",
    ],
    facts: [
      "Core body temperature naturally falls at night — a sauna 1–2 hours before bed amplifies that drop.",
      "Sauna users commonly report falling asleep faster and waking less often on session days.",
      "Pair with a cool shower to accelerate the cooldown effect.",
    ],
  },
  {
    subject: "Sauna is social — and that's the point",
    heroHeadline: "Bring someone.",
    heroSubline: "Shared heat is a Finnish tradition for a reason.",
    paragraphs: [
      "In Finland, the sauna is where conversations happen — no phones, no distractions, just heat and time.",
      "Most Thrml spaces host 2–4 guests. Same price, split the session.",
    ],
    facts: [
      "There are more saunas than cars in Finland — roughly 3 million for 5.5 million people.",
      "Group heat exposure is linked to stronger reported social bonding — sweat is a social lubricant.",
    ],
  },
  {
    subject: "Muscle recovery: what the pros know about heat",
    heroHeadline: "Train hard. Recover hot.",
    heroSubline: "Why athletes book the sauna after the gym, not instead of it.",
    paragraphs: [
      "Post-training heat increases blood flow to worked muscles and may support growth-hormone response.",
    ],
    facts: [
      "Post-exercise sauna sessions increase plasma volume — a legal, natural endurance aid.",
      "Heat after lifting supports circulation to recovering muscle tissue.",
      "Keep cold plunges 4+ hours away from strength training to protect hypertrophy gains.",
    ],
  },
  {
    subject: "Stress, cortisol, and the quietest room you'll find",
    heroHeadline: "The original off switch.",
    heroSubline: "Heat as a nervous-system downshift.",
    paragraphs: [
      "A sauna is one of the last places you physically can't bring your laptop. That constraint is the feature.",
    ],
    facts: [
      "Regular sauna bathing is associated with lower cortisol levels after sessions.",
      "Slow breathing in heat compounds the parasympathetic (rest-and-digest) response.",
      "Even one weekly session is a measurable stress-hygiene habit — start where you can.",
    ],
  },
  {
    subject: "Your skin on sauna: the glow is real",
    heroHeadline: "Sweat is skincare.",
    heroSubline: "What regular heat does for your body's biggest organ.",
    paragraphs: [
      "Deep sweating rinses the skin from the inside out and boosts surface circulation.",
    ],
    facts: [
      "Sauna bathing increases skin blood flow and hydration of the outer skin layer.",
      "Post-sauna, pores flush sweat, oil, and grime — rinse with cool water to finish the job.",
      "Hydrate before and after: a full session can sweat out more than a pound of water.",
    ],
  },
  {
    subject: "Winter is sauna season — here's how to do it right",
    heroHeadline: "Embrace the heat gap.",
    heroSubline: "Cold months are when heat therapy earns its keep.",
    paragraphs: [
      "The bigger the gap between outside and inside temperature, the better a session feels — winter is peak sauna.",
    ],
    facts: [
      "Nordic tradition pairs winter sauna with snow rolls or cold dips — contrast is the point.",
      "Regular winter sessions are associated with fewer reported common colds in some studies.",
      "Book a morning slot: heat first thing sets your circadian rhythm and mood for the day.",
    ],
  },
]

/** Fortnight index since epoch — also selects the edition. */
export function fortnightIndex(now: Date = new Date()): number {
  const weeks = Math.floor((now.getTime() - FORTNIGHT_EPOCH_UTC) / WEEK_MS)
  return Math.floor(weeks / 2)
}

/** True on "send weeks" (every other week relative to the epoch). */
export function isBiweeklySendWeek(now: Date = new Date()): boolean {
  const weeks = Math.floor((now.getTime() - FORTNIGHT_EPOCH_UTC) / WEEK_MS)
  return weeks >= 0 && weeks % 2 === 0
}

export function currentEdition(now: Date = new Date()): { tag: string; edition: NewsletterEdition } {
  const index = Math.max(0, fortnightIndex(now))
  return {
    tag: `edition_${index}`,
    edition: NEWSLETTER_EDITIONS[index % NEWSLETTER_EDITIONS.length],
  }
}

export async function buildBiweeklyNewsletterEmail(args: {
  edition: NewsletterEdition
  unsubscribeUrl: string
}): Promise<{ subject: string; html: string; text: string }> {
  const { edition } = args
  const { html, text } = await renderThrmlEmailPair({
    preview: edition.heroSubline,
    kicker: "The Thrml Dispatch",
    title: edition.subject,
    hero: {
      headline: edition.heroHeadline,
      subline: edition.heroSubline,
      cta: { label: "Book today", href: `${APP_URL}/explore` },
    },
    paragraphs: edition.paragraphs,
    listItems: edition.facts,
    cta: { label: "Find a space near you", href: `${APP_URL}/explore` },
    footnote: `You're receiving the Thrml Dispatch every two weeks. Unsubscribe: ${args.unsubscribeUrl}`,
    appUrl: APP_URL,
  })
  return { subject: edition.subject, html, text }
}

async function sendToNewsletterSubscribers(
  admin: SupabaseClient,
  tag: string,
  edition: NewsletterEdition
): Promise<{ sent: number; handled: Set<string> }> {
  const handled = new Set<string>()
  let sent = 0

  const { data: subscribers } = await admin
    .from("newsletter_subscribers")
    .select("email, last_biweekly_edition")
    .eq("is_active", true)

  for (const row of subscribers ?? []) {
    const email = (row.email as string | null)?.trim().toLowerCase()
    if (!email) continue
    handled.add(email)
    if (row.last_biweekly_edition === tag) continue

    const unsubscribeUrl = `${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}`
    const { subject, html, text } = await buildBiweeklyNewsletterEmail({ edition, unsubscribeUrl })
    const result = await sendEmail({ to: email, subject, html, text })

    if (result.sent) {
      sent++
      await admin
        .from("newsletter_subscribers")
        .update({ last_biweekly_sent_at: new Date().toISOString(), last_biweekly_edition: tag })
        .eq("email", row.email as string)
    }
  }

  return { sent, handled }
}

async function sendToOptedInUsers(
  admin: SupabaseClient,
  tag: string,
  edition: NewsletterEdition,
  alreadyHandled: Set<string>
): Promise<{ sent: number }> {
  let sent = 0

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, notification_preferences")
    .eq("notification_preferences->>marketing_wellness_tips", "true")

  for (const profile of profiles ?? []) {
    const userId = profile.id as string
    if (await emailAlreadySent(userId, EMAIL_TYPE, tag)) continue

    const { data: authUser } = await admin.auth.admin.getUserById(userId)
    const email = authUser.user?.email?.trim().toLowerCase()
    if (!email || alreadyHandled.has(email)) continue

    const unsubscribeUrl = `${APP_URL}/dashboard/account#notifications`
    const { subject, html, text } = await buildBiweeklyNewsletterEmail({ edition, unsubscribeUrl })
    const result = await sendEmail({ to: email, subject, html, text, userId, preferenceKey: "marketing_wellness_tips" })

    if (result.sent) {
      await logEmailSent(userId, EMAIL_TYPE, tag)
      sent++
    }
  }

  return { sent }
}

/**
 * Weekly cron entry point; sends only on alternating ISO weeks.
 * Recipients: active newsletter subscribers + account holders opted into
 * wellness tips, deduped across both lists by email.
 */
export async function processBiweeklyNewsletter(now: Date = new Date()): Promise<{
  sent: number
  skipped_off_week: boolean
}> {
  if (!isBiweeklySendWeek(now)) return { sent: 0, skipped_off_week: true }

  const admin = createAdminClient()
  const { tag, edition } = currentEdition(now)

  const subscriberResult = await sendToNewsletterSubscribers(admin, tag, edition)
  const userResult = await sendToOptedInUsers(admin, tag, edition, subscriberResult.handled)

  return { sent: subscriberResult.sent + userResult.sent, skipped_off_week: false }
}
