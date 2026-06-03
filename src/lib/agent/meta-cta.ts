/**
 * Maps thrml brief CTAs (display labels + naming tokens) to Meta Marketing API
 * `call_to_action.type` enum values.
 */

/** Display labels and internal naming tokens → Meta API call_to_action.type */
const CTA_TO_META_ENUM: Record<string, string> = {
  // Display labels (creative_briefs.cta)
  "List Your Space": "SIGN_UP",
  "List Now": "SIGN_UP",
  "Book Now": "BOOK_TRAVEL",
  "Find Your Space": "LEARN_MORE",
  "Reserve Your Hour": "BOOK_TRAVEL",
  "Explore Spaces": "LEARN_MORE",
  "See What's Near You": "LEARN_MORE",
  "Learn More": "LEARN_MORE",
  "Get Started": "GET_STARTED",
  "Sign Up": "SIGN_UP",
  "See How": "LEARN_MORE",
  "Join Waitlist": "SIGN_UP",
  // Naming tokens (trigger_data.naming.cta / convention_name suffix)
  list_now: "SIGN_UP",
  learn_more: "LEARN_MORE",
  get_started: "GET_STARTED",
  see_how: "LEARN_MORE",
  book_now: "BOOK_TRAVEL",
  explore: "LEARN_MORE",
  join_waitlist: "SIGN_UP",
  sign_up: "SIGN_UP",
}

const DEFAULT_META_CTA = "SIGN_UP"

function normalizeCtaKey(cta: string): string {
  const trimmed = cta.trim()
  if (CTA_TO_META_ENUM[trimmed]) return trimmed
  const snake = trimmed.toLowerCase().replace(/\s+/g, "_")
  if (CTA_TO_META_ENUM[snake]) return snake
  const title = trimmed
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
  if (CTA_TO_META_ENUM[title]) return title
  return trimmed
}

export function resolveBriefCtaToken(brief: {
  cta?: string | null
  trigger_data?: Record<string, unknown> | null
}): string {
  const naming = brief.trigger_data?.naming
  if (naming && typeof naming === "object" && !Array.isArray(naming)) {
    const token = (naming as { cta?: unknown }).cta
    if (typeof token === "string" && token.trim()) return token.trim()
  }
  return brief.cta?.trim() || "list_now"
}

export function ctaToMetaEnum(cta: string | null | undefined): string {
  const raw = cta?.trim() || "list_now"
  const key = normalizeCtaKey(raw)
  const metaEnum = CTA_TO_META_ENUM[key]
  if (metaEnum) return metaEnum
  console.warn("[meta-cta] unknown CTA, defaulting to SIGN_UP:", raw)
  return DEFAULT_META_CTA
}

export function ctaToMetaEnumFromBrief(brief: {
  cta?: string | null
  trigger_data?: Record<string, unknown> | null
}): string {
  return ctaToMetaEnum(resolveBriefCtaToken(brief))
}

export function supportedCtaLabels(): string[] {
  return Object.keys(CTA_TO_META_ENUM).filter((k) => !k.includes("_") || k === k.toLowerCase())
}
