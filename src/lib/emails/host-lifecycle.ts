import { sendThrmlLayoutEmail, THRML_APP_URL } from "@/lib/emails/transactional-send"
import { createAdminClient } from "@/lib/supabase/admin"

import { emailAlreadySent, logEmailSent } from "./email-log"

const APP_URL = THRML_APP_URL

const EMAIL_POLICIES = "host_policies"
const EMAIL_LISTING_BEST_PRACTICES = "host_listing_best_practices"
const EMAIL_FIRST_LISTING_LIVE = "host_first_listing_live"
const EMAIL_STRIPE_REMINDER_1 = "host_stripe_connect_reminder_1"
const EMAIL_STRIPE_REMINDER_2 = "host_stripe_connect_reminder_2"
const EMAIL_TIPS_CLEANLINESS = "host_tips_cleanliness"
const EMAIL_TIPS_SCHEDULING = "host_tips_scheduling"

const DAY_MS = 24 * 60 * 60 * 1000

type HostProfileRow = {
  id: string
  full_name: string | null
  created_at: string
  stripe_account_id?: string | null
  stripe_payouts_enabled?: boolean | null
}

function firstName(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? "").trim()
  return trimmed ? (trimmed.split(/\s+/)[0] ?? "there") : "there"
}

function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS)
}

async function emailForProfile(profileId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.auth.admin.getUserById(profileId)
  return data.user?.email ?? null
}

/** Day 1 — host standards & policies (transactional onboarding). */
async function sendHostPoliciesEmail(profile: HostProfileRow): Promise<boolean> {
  if (await emailAlreadySent(profile.id, EMAIL_POLICIES)) return false
  const email = await emailForProfile(profile.id)
  if (!email) return false

  const result = await sendThrmlLayoutEmail({
    to: email,
    userId: profile.id,
    preferenceKey: "new_booking",
    subject: "Hosting on Thrml — our standards, your policies",
    layout: {
      preview: "What every Thrml host agrees to, and how policies protect you",
      kicker: "Host standards",
      title: "The standards behind every great session.",
      greeting: `Hi ${firstName(profile.full_name)},`,
      paragraphs: [
        "Before your first guest arrives, here's what hosting on Thrml means — for you and for them:",
      ],
      listItems: [
        "Clean between every session — fresh towels if offered, sanitized surfaces, and clear water changeover for plunges and tubs.",
        "Accurate listings — photos, access details, and amenities should match exactly what guests find.",
        "Respect the schedule — honor confirmed bookings, and keep your calendar current to avoid cancellations.",
        "Safety first — post usage guidance, keep equipment maintained, and complete your insurance attestation.",
      ],
      cta: { label: "Review host policies", href: `${APP_URL}/legal` },
      footnote:
        "Cancellations, refunds, and payout timing are covered in your host dashboard. Questions? Just reply to this email.",
    },
  })

  if (result.sent) await logEmailSent(profile.id, EMAIL_POLICIES)
  return result.sent
}

/** Day 2 — best practices for creating a listing that books. */
async function sendListingBestPracticesEmail(profile: HostProfileRow): Promise<boolean> {
  if (await emailAlreadySent(profile.id, EMAIL_LISTING_BEST_PRACTICES)) return false
  const email = await emailForProfile(profile.id)
  if (!email) return false

  const result = await sendThrmlLayoutEmail({
    to: email,
    userId: profile.id,
    preferenceKey: "new_booking",
    subject: "The anatomy of a listing that books every weekend",
    layout: {
      preview: "Photos, pricing, and access details that turn browsers into bookings",
      kicker: "Listing playbook",
      title: "Build a listing guests can't scroll past.",
      greeting: `Hi ${firstName(profile.full_name)},`,
      paragraphs: ["The best-performing Thrml listings share five things:"],
      listItems: [
        "Lead with your best photo — bright, steam-on or lit at dusk. Listings with 5+ photos book significantly more.",
        "Price for discovery — start slightly under comparable listings nearby, then raise as reviews come in.",
        "Write access instructions like a friend would — parking, entry, what to bring, where the light switch is.",
        "Open real availability — evenings and weekend mornings are peak demand for saunas and plunges.",
        "Set your session buffer — leave enough time between bookings to reset the space properly.",
      ],
      cta: { label: "Create or polish your listing", href: `${APP_URL}/dashboard/listings/new` },
    },
  })

  if (result.sent) await logEmailSent(profile.id, EMAIL_LISTING_BEST_PRACTICES)
  return result.sent
}

/** Sent once when a host's first listing goes live. */
async function sendFirstListingLiveEmail(args: {
  profile: HostProfileRow
  listingId: string
  listingTitle: string | null
}): Promise<boolean> {
  if (await emailAlreadySent(args.profile.id, EMAIL_FIRST_LISTING_LIVE)) return false
  const email = await emailForProfile(args.profile.id)
  if (!email) return false

  const title = args.listingTitle ?? "Your space"
  const result = await sendThrmlLayoutEmail({
    to: email,
    userId: args.profile.id,
    preferenceKey: "new_booking",
    subject: `${title} is live on Thrml 🎉`,
    layout: {
      preview: "Your first listing is live — here's what happens next",
      kicker: "Listing live",
      title: "Your space is officially bookable.",
      greeting: `Hi ${firstName(args.profile.full_name)},`,
      paragraphs: [
        `${title} is now live and visible to guests near you. Nice work.`,
        "Three things that help new listings get their first booking fast:",
      ],
      listItems: [
        "Share your listing link — hosts who share to their network usually get their first booking within days.",
        "Keep availability open for the next two weekends — that's when most first bookings land.",
        "Verify your identity for the Verified Host badge — verified listings convert meaningfully better.",
      ],
      cta: { label: "View your live listing", href: `${APP_URL}/listings/${args.listingId}` },
    },
  })

  if (result.sent) await logEmailSent(args.profile.id, EMAIL_FIRST_LISTING_LIVE)
  return result.sent
}

/** Stripe payout reminder for hosts with a live listing but payouts not enabled. */
async function sendStripeConnectReminder(args: {
  profile: HostProfileRow
  reminderTag: typeof EMAIL_STRIPE_REMINDER_1 | typeof EMAIL_STRIPE_REMINDER_2
}): Promise<boolean> {
  if (await emailAlreadySent(args.profile.id, args.reminderTag)) return false
  const email = await emailForProfile(args.profile.id)
  if (!email) return false

  const second = args.reminderTag === EMAIL_STRIPE_REMINDER_2
  const result = await sendThrmlLayoutEmail({
    to: email,
    userId: args.profile.id,
    preferenceKey: "payout_sent",
    subject: second
      ? "Don't leave payouts on the table — connect Stripe"
      : "One step left before you can get paid",
    layout: {
      preview: "Connect Stripe so payouts land the moment a booking completes",
      kicker: "Payouts",
      title: second ? "Your listing is live. Your payouts aren't." : "Set up payouts before your first booking.",
      greeting: `Hi ${firstName(args.profile.full_name)},`,
      paragraphs: second
        ? [
            "Your space is bookable, but without Stripe connected we can't pay you when sessions complete.",
            "It takes about 3 minutes — bank details, a quick identity check, done. Payouts then arrive automatically after each session.",
          ]
        : [
            "Your listing is live — the last step is connecting Stripe so payouts have somewhere to go.",
            "Guests can book either way, but connecting now means your first payout arrives right on time.",
          ],
      cta: { label: "Connect Stripe payouts", href: `${APP_URL}/dashboard/account#payouts` },
      footnote: "Stripe is our payments partner. Thrml never sees or stores your bank credentials.",
    },
  })

  if (result.sent) await logEmailSent(args.profile.id, args.reminderTag)
  return result.sent
}

/** Rotating host tips (marketing-gated). */
async function sendHostTipsEmail(args: {
  profile: HostProfileRow
  tag: typeof EMAIL_TIPS_CLEANLINESS | typeof EMAIL_TIPS_SCHEDULING
}): Promise<boolean> {
  if (await emailAlreadySent(args.profile.id, args.tag)) return false
  const email = await emailForProfile(args.profile.id)
  if (!email) return false

  const cleanliness = args.tag === EMAIL_TIPS_CLEANLINESS
  const result = await sendThrmlLayoutEmail({
    to: email,
    userId: args.profile.id,
    preferenceKey: "marketing_product_updates",
    subject: cleanliness
      ? "Host tips: the 15-minute reset that earns 5-star reviews"
      : "Host tips: schedule like the top hosts do",
    layout: {
      preview: cleanliness
        ? "A simple turnover routine guests notice immediately"
        : "Availability patterns that fill your calendar",
      kicker: "Host tips",
      title: cleanliness ? "Cleanliness is your best review magnet." : "Your calendar is a growth lever.",
      greeting: `Hi ${firstName(args.profile.full_name)},`,
      paragraphs: cleanliness
        ? ["Guests mention cleanliness in reviews more than any other factor. A repeatable reset routine:"]
        : ["A few scheduling habits separate consistently-booked hosts from everyone else:"],
      listItems: cleanliness
        ? [
            "Wipe benches, handles, and controls with a sauna-safe cleaner after every session.",
            "Swap or restock towels, and stage them the same way every time — consistency reads as care.",
            "For plunges and tubs: check water clarity and temperature before each guest window.",
            "Do a 30-second nose check — the space should smell like cedar or nothing at all.",
            "Photograph your 'reset state' once and match it before every booking.",
          ]
        : [
            "Open evenings (6–10pm) and weekend mornings — that's when wellness sessions peak.",
            "Use buffers between sessions so you never rush a turnover.",
            "Block personal time in advance instead of declining requests — declines hurt your ranking.",
            "Enable instant book once your routine is dialed in — it lifts conversion noticeably.",
          ],
      cta: { label: "Open your dashboard", href: `${APP_URL}/dashboard/listings` },
      footnote: `You're receiving host tips because product updates are enabled. Manage preferences: ${APP_URL}/dashboard/account#notifications`,
    },
  })

  if (result.sent) await logEmailSent(args.profile.id, args.tag)
  return result.sent
}

/**
 * Daily cron: walks new-ish hosts through policies → listing playbook →
 * first-listing celebration → Stripe payouts → ongoing tips.
 * Every send is deduped via email_log, so windows are intentionally wide.
 */
export async function processHostLifecycle(): Promise<{ sent: number }> {
  const admin = createAdminClient()
  const now = new Date()
  const lookback = new Date(now.getTime() - 30 * DAY_MS).toISOString()
  let sent = 0

  const { data: hostsRaw } = await admin
    .from("profiles")
    .select("id, full_name, created_at, stripe_account_id, stripe_payouts_enabled")
    .eq("is_host", true)
    .gte("created_at", lookback)

  const hosts = (hostsRaw ?? []) as HostProfileRow[]
  if (!hosts.length) return { sent: 0 }

  const hostIds = hosts.map((h) => h.id)
  const { data: listingsRaw } = await admin
    .from("listings")
    .select("id, host_id, title, created_at, is_active")
    .in("host_id", hostIds)
    .order("created_at", { ascending: true })

  const firstListingByHost = new Map<string, { id: string; title: string | null; created_at: string; is_active: boolean }>()
  for (const row of listingsRaw ?? []) {
    const hostId = row.host_id as string
    if (!firstListingByHost.has(hostId)) {
      firstListingByHost.set(hostId, {
        id: row.id as string,
        title: (row.title as string | null) ?? null,
        created_at: row.created_at as string,
        is_active: Boolean(row.is_active),
      })
    }
  }

  for (const host of hosts) {
    const age = daysSince(host.created_at, now)
    const listing = firstListingByHost.get(host.id)
    const payoutsReady = Boolean(host.stripe_payouts_enabled)

    // At most one lifecycle email per host per run — a backlog drips out
    // one message per day instead of arriving as a stack.
    try {
      if (age >= 1 && (await sendHostPoliciesEmail(host))) {
        sent++
        continue
      }
      if (age >= 2 && (await sendListingBestPracticesEmail(host))) {
        sent++
        continue
      }

      if (listing?.is_active) {
        if (await sendFirstListingLiveEmail({ profile: host, listingId: listing.id, listingTitle: listing.title })) {
          sent++
          continue
        }

        const listingAge = daysSince(listing.created_at, now)
        if (!payoutsReady) {
          const stripeTag =
            listingAge >= 9 ? EMAIL_STRIPE_REMINDER_2 : listingAge >= 2 ? EMAIL_STRIPE_REMINDER_1 : null
          if (stripeTag && (await sendStripeConnectReminder({ profile: host, reminderTag: stripeTag }))) {
            sent++
            continue
          }
        }

        if (age >= 10 && (await sendHostTipsEmail({ profile: host, tag: EMAIL_TIPS_CLEANLINESS }))) {
          sent++
          continue
        }
        if (age >= 21 && (await sendHostTipsEmail({ profile: host, tag: EMAIL_TIPS_SCHEDULING }))) {
          sent++
          continue
        }
      }
    } catch (error) {
      console.error("[emails/host-lifecycle] failed for host", {
        hostId: host.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { sent }
}
