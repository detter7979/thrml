/**
 * Shared helpers for the host acquisition funnel:
 * landing (/become-a-host) → signup (host intent) → ground rules + host terms → listing wizard.
 */

/** Paths that mean "this visitor is signing up to host". */
const HOST_FUNNEL_PREFIXES = ["/become-a-host", "/dashboard/host"]

export function isHostFunnelPath(path: string | null | undefined): boolean {
  if (!path) return false
  const pathname = path.split("?")[0] ?? ""
  return HOST_FUNNEL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/** Where signup sends a host prospect back to: the landing flow, resuming at the ground rules. */
export const HOST_SIGNUP_RETURN_PATH = "/become-a-host?resume=1"

export function hostSignupHref(): string {
  return `/signup?intent=host&next=${encodeURIComponent(HOST_SIGNUP_RETURN_PATH)}`
}

export function hostLoginHref(): string {
  return `/login?next=${encodeURIComponent(HOST_SIGNUP_RETURN_PATH)}`
}

/**
 * Guest bookings are opened deliberately once supply is ready (target: ~12–15 live listings
 * across several neighborhoods). Until then host emails avoid promising imminent bookings.
 * Flip by setting GUEST_BOOKINGS_OPEN=true in Vercel.
 */
export function guestBookingsOpen(): boolean {
  return process.env.GUEST_BOOKINGS_OPEN === "true"
}

/** No-listing nudges for hosts who signed up but haven't published a space. */
export const NO_LISTING_NUDGES = [
  { tag: "host_no_listing_nudge_1", minAgeDays: 3 },
  { tag: "host_no_listing_nudge_2", minAgeDays: 7 },
  { tag: "host_no_listing_nudge_3", minAgeDays: 14 },
] as const

export type NoListingNudgeTag = (typeof NO_LISTING_NUDGES)[number]["tag"]

/**
 * The single nudge due now: the latest stage the host has reached that hasn't been sent.
 * Earlier unsent stages are skipped so a late-detected host doesn't get a backlog.
 */
export function pickNoListingNudge(
  ageDays: number,
  alreadySent: ReadonlySet<string>
): NoListingNudgeTag | null {
  const reached = NO_LISTING_NUDGES.filter((n) => ageDays >= n.minAgeDays)
  const latest = reached[reached.length - 1]
  if (!latest || alreadySent.has(latest.tag)) return null
  return latest.tag
}

/**
 * A host has finished the landing flow once they've accepted the host terms (or already have a
 * live listing, for hosts who predate the flow). Host *intent* alone isn't enough — that's set
 * at signup, before the ground rules and host agreement.
 */
export function hasCompletedHostOnboarding(input: {
  activeListingCount: number
  hostTermsAccepted?: boolean | null
}): boolean {
  return input.activeListingCount > 0 || input.hostTermsAccepted === true
}

/** Share of the listing wizard a draft has completed (steps finished before the current one). */
export function draftProgressPercent(step: number, totalSteps: number, firstStep = 1): number {
  const span = Math.max(1, totalSteps - firstStep + 1)
  const done = Math.min(Math.max(step - firstStep, 0), span)
  return Math.round((done / span) * 100)
}

/** Draft reminders: day 1 and day 4 after the host last touched their draft. */
export const DRAFT_REMINDERS = [
  { tag: "host_draft_reminder_1", minIdleDays: 1 },
  { tag: "host_draft_reminder_2", minIdleDays: 4 },
] as const

export type DraftReminderTag = (typeof DRAFT_REMINDERS)[number]["tag"]

export function pickDraftReminder(
  idleDays: number,
  alreadySent: ReadonlySet<string>
): DraftReminderTag | null {
  const reached = DRAFT_REMINDERS.filter((r) => idleDays >= r.minIdleDays)
  const latest = reached[reached.length - 1]
  if (!latest || alreadySent.has(latest.tag)) return null
  return latest.tag
}

/** Identity reminders for live hosts who never started verification: day 2 and 7 after listing. */
export const IDENTITY_START_REMINDERS = [
  { tag: "host_identity_start_reminder_1", minAgeDays: 2 },
  { tag: "host_identity_start_reminder_2", minAgeDays: 7 },
] as const

export type IdentityStartReminderTag = (typeof IDENTITY_START_REMINDERS)[number]["tag"]

export function pickIdentityStartReminder(
  listingAgeDays: number,
  alreadySent: ReadonlySet<string>
): IdentityStartReminderTag | null {
  const reached = IDENTITY_START_REMINDERS.filter((r) => listingAgeDays >= r.minAgeDays)
  const latest = reached[reached.length - 1]
  if (!latest || alreadySent.has(latest.tag)) return null
  return latest.tag
}

export type HostSetupStepId = "agreement" | "listing" | "identity" | "payouts"

export type HostSetupStep = {
  id: HostSetupStepId
  label: string
  detail: string
  done: boolean
  href: string
  cta: string
}

/** The host setup checklist shown on the dashboard. Order is the order we want hosts to go. */
export function hostSetupSteps(input: {
  hostTermsAccepted: boolean
  hasLiveListing: boolean
  draftPercent: number | null
  idVerified: boolean
  payoutsEnabled: boolean
}): { steps: HostSetupStep[]; completed: number; total: number } {
  const steps: HostSetupStep[] = [
    {
      id: "agreement",
      label: "Accept the host agreement",
      detail: "Ground rules and host terms — takes a minute.",
      done: input.hostTermsAccepted || input.hasLiveListing,
      href: HOST_SIGNUP_RETURN_PATH,
      cta: "Review",
    },
    {
      id: "listing",
      label: "List your space",
      detail: input.hasLiveListing
        ? "Your space is live."
        : input.draftPercent !== null
          ? `Your draft is ${input.draftPercent}% done — pick up where you left off.`
          : "Photos (3+), a price per session and your hours. About 10 minutes.",
      done: input.hasLiveListing,
      href: "/dashboard/host/new",
      cta: input.draftPercent !== null ? "Continue" : "Start",
    },
    {
      id: "identity",
      label: "Verify your identity",
      detail: "Earns the Verified Host badge guests look for.",
      done: input.idVerified,
      href: "/dashboard/account#identity",
      cta: "Verify",
    },
    {
      id: "payouts",
      label: "Connect payouts",
      detail: "Get paid out to your bank through Stripe.",
      done: input.payoutsEnabled,
      href: "/dashboard/account#payout-settings",
      cta: "Connect",
    },
  ]
  return { steps, completed: steps.filter((s) => s.done).length, total: steps.length }
}

/**
 * How to describe which spaces can be listed. While NEXT_PUBLIC_SAUNAS_ONLY_LAUNCH is on (the
 * default) the listing wizard only accepts saunas, so copy must not promise other types yet.
 */
export function hostSpaceTypesSentence(saunasOnly: boolean): string {
  return saunasOnly
    ? "We're starting with private saunas, indoor and outdoor. We're planning to add cold plunges, hot tubs and float tanks next."
    : "Saunas, cold plunges, hot tubs, float tanks and other private wellness spaces are all welcome."
}

/** Host progress updates go out every 14 days, anchored to Tuesday 2026-11-17. */
const PROGRESS_ANCHOR_MS = Date.UTC(2026, 10, 17)
const PROGRESS_PERIOD_DAYS = 14
/** Only send in the first few days of a period so new hosts don't get one mid-cycle. */
const PROGRESS_SEND_WINDOW_DAYS = 3

/** The current update period's start date (YYYY-MM-DD) if we're inside its send window. */
export function hostProgressUpdatePeriod(now: Date): string | null {
  const elapsedDays = Math.floor((now.getTime() - PROGRESS_ANCHOR_MS) / 86_400_000)
  if (elapsedDays < 0) return null
  const periodIndex = Math.floor(elapsedDays / PROGRESS_PERIOD_DAYS)
  const dayInPeriod = elapsedDays - periodIndex * PROGRESS_PERIOD_DAYS
  if (dayInPeriod >= PROGRESS_SEND_WINDOW_DAYS) return null
  const start = new Date(PROGRESS_ANCHOR_MS + periodIndex * PROGRESS_PERIOD_DAYS * 86_400_000)
  return start.toISOString().slice(0, 10)
}
