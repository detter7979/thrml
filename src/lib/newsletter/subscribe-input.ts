import type { NewsletterSource } from "@/lib/meta/newsletter-lead"

const SOURCES: readonly NewsletterSource[] = ["homepage", "account", "launch_waitlist", "guest_lp"]

/** Sources that mean "tell me when bookings open". */
const LAUNCH_SOURCES: readonly NewsletterSource[] = ["launch_waitlist", "guest_lp"]

export type SubscribeExtras = {
  source: NewsletterSource
  launchNotify: boolean
  signupPath: string | null
  utmSource: string | null
  utmCampaign: string | null
}

function cleanShort(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const t = value.replace(/[^\w\-./:]/g, "").slice(0, max)
  return t.length ? t : null
}

/** Parses the optional launch-list fields of a subscribe request. Unknown values fall back safely. */
export function parseSubscribeExtras(body: Record<string, unknown> | null | undefined): SubscribeExtras {
  const raw = body?.source
  const source: NewsletterSource =
    typeof raw === "string" && (SOURCES as readonly string[]).includes(raw)
      ? (raw as NewsletterSource)
      : "homepage"
  const launchNotify = body?.launch_notify === true || LAUNCH_SOURCES.includes(source)
  const path = cleanShort(body?.signup_path, 120)
  return {
    source,
    launchNotify,
    signupPath: path && path.startsWith("/") ? path : null,
    utmSource: cleanShort(body?.utm_source, 60),
    utmCampaign: cleanShort(body?.utm_campaign, 120),
  }
}
