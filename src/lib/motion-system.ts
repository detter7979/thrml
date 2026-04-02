/** Shared easings / timings for navigation + listing detail cascades (max 400ms for nav). */
export const NAV_TRANSITION_EASE = [0.25, 1, 0.5, 1] as const

export const LISTING_ENTER = {
  duration: 0.32 as const,
  ease: NAV_TRANSITION_EASE,
}

export const LISTING_EXIT = {
  duration: 0.22 as const,
  ease: NAV_TRANSITION_EASE,
}

export const CASCADE_TRANSITION = {
  duration: 0.28 as const,
  ease: NAV_TRANSITION_EASE,
}

export const CASCADE_STAGGER_S = 0.055
export const CASCADE_LEAD_S = 0.05

export function listingHeroLayoutId(listingId: string) {
  return `listing-hero-${listingId}`
}

export function listingCascadeDelay(step: number) {
  return CASCADE_LEAD_S + step * CASCADE_STAGGER_S
}
