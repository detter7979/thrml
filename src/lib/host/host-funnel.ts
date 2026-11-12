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
