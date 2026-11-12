import { sendThrmlLayoutEmail, THRML_APP_URL } from "@/lib/emails/transactional-send"
import {
  draftProgressPercent,
  guestBookingsOpen,
  hostSpaceTypesSentence,
  pickDraftReminder,
  pickIdentityStartReminder,
  pickNoListingNudge,
  type DraftReminderTag,
  type IdentityStartReminderTag,
  type NoListingNudgeTag,
} from "@/lib/host/host-funnel"
import { fetchFoundingHostSettings } from "@/lib/host/founding-host"
import { isSaunasOnlyLaunch } from "@/lib/launch-config"
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
  id_verified?: boolean | null
  id_verification_status?: string | null
  founding_host?: boolean | null
}

type DraftRow = {
  host_id: string
  step: number
  total_steps: number
  photo_urls: string[] | null
  updated_at: string
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
  const open = guestBookingsOpen()
  const founding = args.profile.founding_host === true ? await fetchFoundingHostSettings(createAdminClient()) : null
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
      paragraphs: open
        ? [
            `${title} is now live and visible to guests near you. Nice work.`,
            "Three things that help new listings get their first booking fast:",
          ]
        : [
            founding
              ? `${title} is live — you're one of our founding hosts. Nice work. As a thank-you, your host fee is ${founding.feePercent}% instead of the usual rate for your first ${founding.windowDays} days of bookings (the clock starts at your first booking).`
              : `${title} is live. Nice work.`,
            "We're opening guest bookings once there's a strong mix of spaces across the Seattle area, and we'll email you before the first guests arrive. To be ready on day one:",
          ],
      listItems: open
        ? [
            "Share your listing link — hosts who share to their network usually get their first booking within days.",
            "Keep availability open for the next two weekends — that's when most first bookings land.",
            "Verify your identity for the Verified Host badge — verified listings convert meaningfully better.",
          ]
        : [
            "Connect Stripe payouts so your earnings go straight to your bank account.",
            "Verify your identity for the Verified Host badge — verified listings convert meaningfully better.",
            "Keep your calendar open a few weeks out so your space is bookable the day we launch.",
            "Know someone with a home sauna? Send them our way — more spaces means a faster launch.",
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
            "It takes about 3 minutes — bank details, a quick identity check, done. Your earnings are then paid out to your bank on Stripe's payout schedule.",
          ]
        : [
            "Your listing is live — the last step is connecting Stripe so payouts have somewhere to go.",
            "Connecting now means you're ready the moment bookings come in, and your first payout arrives right on time.",
          ],
      cta: { label: "Connect Stripe payouts", href: `${APP_URL}/dashboard/account#payout-settings` },
      footnote: "Stripe is our payments partner. Thrml never sees or stores your bank credentials.",
    },
  })

  if (result.sent) await logEmailSent(args.profile.id, args.reminderTag)
  return result.sent
}

const NO_LISTING_COPY: Record<
  NoListingNudgeTag,
  { subject: string; preview: string; title: string; paragraphs: string[]; cta: string }
> = {
  host_no_listing_nudge_1: {
    subject: "Your space is about 10 minutes from live",
    preview: "Photos, a price and your hours — that's all it takes to list",
    title: "Let's get your space listed.",
    paragraphs: [
      "You signed up to host on thrml but haven't listed your space yet. It takes about 10 minutes: a few photos, a price per session and the hours you're open.",
      `${hostSpaceTypesSentence(isSaunasOnlyLaunch())} One space is plenty to start.`,
    ],
    cta: "List my space",
  },
  host_no_listing_nudge_2: {
    subject: "Want a hand setting up your listing?",
    preview: "Reply and we'll walk through it with you",
    title: "We're happy to help you list.",
    paragraphs: [
      "Not sure what to charge, what to photograph or how guests get in? Just reply to this email — we'll answer directly, or set up a quick 15-minute call and get your space live together.",
      "We're onboarding a small group of founding hosts in the Seattle area before opening guest bookings, and we'd love yours to be one of them.",
    ],
    cta: "Finish my listing",
  },
  host_no_listing_nudge_3: {
    subject: "Still thinking about hosting?",
    preview: "Your account is ready whenever you are",
    title: "Your host account is ready when you are.",
    paragraphs: [
      "This is our last reminder about listing your space. Listing is free, you set your own price and hours, and you can pause anytime.",
      "If hosting isn't for you right now, no problem — we won't keep nudging. If something stopped you, reply and let us know; it genuinely helps.",
    ],
    cta: "List my space",
  },
}

async function sentTagsWithPrefix(profileId: string, prefix: string): Promise<Set<string>> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("email_log")
    .select("email_type")
    .eq("user_id", profileId)
    .like("email_type", `${prefix}%`)
  return new Set((data ?? []).map((row) => String(row.email_type)))
}

/** Draft started but not published — day 1 and 4 after the host last touched it. */
async function sendDraftReminder(args: {
  profile: HostProfileRow
  draft: DraftRow
  tag: DraftReminderTag
}): Promise<boolean> {
  if (await emailAlreadySent(args.profile.id, args.tag)) return false
  const email = await emailForProfile(args.profile.id)
  if (!email) return false

  // The saunas-only wizard skips the service-type step, so it starts at step 2.
  const firstStep = isSaunasOnlyLaunch() ? 2 : 1
  const percent = draftProgressPercent(args.draft.step, args.draft.total_steps, firstStep)
  const photoCount = (args.draft.photo_urls ?? []).length
  const second = args.tag === "host_draft_reminder_2"

  const result = await sendThrmlLayoutEmail({
    to: email,
    userId: args.profile.id,
    preferenceKey: "new_booking",
    subject: second ? "Your listing draft is still saved" : `Your listing is ${percent}% done`,
    layout: {
      preview: "Everything you entered is saved — pick up where you left off",
      kicker: "Finish your listing",
      title: second ? "Your draft is right where you left it." : `You're ${percent}% of the way there.`,
      greeting: `Hi ${firstName(args.profile.full_name)},`,
      paragraphs: [
        photoCount > 0
          ? `Your details and ${photoCount} photo${photoCount === 1 ? "" : "s"} are saved. Finish the remaining steps and your space goes live.`
          : "Everything you entered is saved. Finish the remaining steps and your space goes live.",
        second
          ? "Stuck on pricing, photos or access details? Reply to this email and we'll help you finish it."
          : "Most hosts finish in under 10 minutes once they're back in.",
      ],
      cta: { label: "Finish my listing", href: `${APP_URL}/dashboard/host/new` },
    },
  })

  if (result.sent) await logEmailSent(args.profile.id, args.tag)
  return result.sent
}

/** Live listing, identity verification never started — day 2 and 7 after the listing. */
async function sendIdentityStartReminder(args: {
  profile: HostProfileRow
  tag: IdentityStartReminderTag
}): Promise<boolean> {
  if (await emailAlreadySent(args.profile.id, args.tag)) return false
  const email = await emailForProfile(args.profile.id)
  if (!email) return false

  const second = args.tag === "host_identity_start_reminder_2"
  const result = await sendThrmlLayoutEmail({
    to: email,
    userId: args.profile.id,
    preferenceKey: "new_booking",
    subject: second ? "Guests look for the Verified Host badge" : "Get your Verified Host badge",
    layout: {
      preview: "A quick ID check through Stripe — about 2 minutes",
      kicker: "Verify your identity",
      title: "Show guests they're booking with a real person.",
      greeting: `Hi ${firstName(args.profile.full_name)},`,
      paragraphs: [
        "Guests are booking time in your private space, so trust matters. Verifying your identity adds the Verified Host badge to your profile and listing.",
        "It's a quick ID check through Stripe — about 2 minutes. thrml never sees or stores your ID document.",
      ],
      cta: { label: "Verify my identity", href: `${APP_URL}/dashboard/account#identity` },
    },
  })

  if (result.sent) await logEmailSent(args.profile.id, args.tag)
  return result.sent
}

/** Hosts who signed up but haven't published a listing — day 3, 7 and 14. */
async function sendNoListingNudge(args: { profile: HostProfileRow; tag: NoListingNudgeTag }): Promise<boolean> {
  if (await emailAlreadySent(args.profile.id, args.tag)) return false
  const email = await emailForProfile(args.profile.id)
  if (!email) return false

  const copy = NO_LISTING_COPY[args.tag]
  const result = await sendThrmlLayoutEmail({
    to: email,
    userId: args.profile.id,
    preferenceKey: "new_booking",
    subject: copy.subject,
    layout: {
      preview: copy.preview,
      kicker: "Finish setting up",
      title: copy.title,
      greeting: `Hi ${firstName(args.profile.full_name)},`,
      paragraphs: copy.paragraphs,
      cta: { label: copy.cta, href: `${APP_URL}/become-a-host?resume=1` },
    },
  })

  if (result.sent) await logEmailSent(args.profile.id, args.tag)
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
    .select(
      "id, full_name, created_at, stripe_account_id, stripe_payouts_enabled, id_verified, id_verification_status, founding_host"
    )
    // Include hosts who signed up with host intent but haven't published yet — `is_host` is only
    // set once a listing is created, and those are exactly the hosts who need reminders.
    .or("is_host.eq.true,ui_intent.in.(host,both)")
    .gte("created_at", lookback)

  const hosts = (hostsRaw ?? []) as HostProfileRow[]
  if (!hosts.length) return { sent: 0 }

  const hostIds = hosts.map((h) => h.id)
  const { data: listingsRaw } = await admin
    .from("listings")
    .select("id, host_id, title, created_at, is_active")
    .in("host_id", hostIds)
    .order("created_at", { ascending: true })

  const { data: draftsRaw } = await admin
    .from("host_listing_drafts")
    .select("host_id, step, total_steps, photo_urls, updated_at")
    .in("host_id", hostIds)
  const draftByHost = new Map<string, DraftRow>(
    ((draftsRaw ?? []) as DraftRow[]).map((draft) => [draft.host_id, draft])
  )

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

      if (!listing) {
        const draft = draftByHost.get(host.id)
        if (draft) {
          // Started a draft: remind them to finish it instead of the generic "list your space".
          const reminder = pickDraftReminder(
            daysSince(draft.updated_at, now),
            await sentTagsWithPrefix(host.id, "host_draft_reminder_")
          )
          if (reminder && (await sendDraftReminder({ profile: host, draft, tag: reminder }))) {
            sent++
            continue
          }
        } else {
          const nudge = pickNoListingNudge(age, await sentTagsWithPrefix(host.id, "host_no_listing_nudge_"))
          if (nudge && (await sendNoListingNudge({ profile: host, tag: nudge }))) {
            sent++
            continue
          }
        }
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

        const verificationNeverStarted =
          !host.id_verified && (host.id_verification_status == null || host.id_verification_status === "")
        if (verificationNeverStarted) {
          const identityTag = pickIdentityStartReminder(
            listingAge,
            await sentTagsWithPrefix(host.id, "host_identity_start_reminder_")
          )
          if (identityTag && (await sendIdentityStartReminder({ profile: host, tag: identityTag }))) {
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
