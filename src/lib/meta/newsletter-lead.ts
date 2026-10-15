import crypto from "crypto"

import type { NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  buildFbcFromFbclid,
  extractFbclidFromUrl,
  fireCapiEvent,
  getClientIpFromHeaders,
  META_EVENT_NEWSLETTER_LEAD,
  type FireCapiEventResult,
} from "@/lib/meta-capi"

export type NewsletterSource = "homepage" | "account"

export function newNewsletterLeadEventId(): string {
  return `lead_newsletter_${crypto.randomUUID()}`
}

/**
 * Server-side Lead for a NEW newsletter subscriber. The browser fires the same event with the
 * same event_id (returned in the subscribe response), so Meta keeps one. Consent is enforced
 * inside fireCapiEvent (thrml_ad_consent cookie, or the signed-in profile's marketing_consent).
 */
export async function fireNewsletterLead(
  req: NextRequest,
  admin: SupabaseClient,
  opts: { email: string; eventId: string; source: NewsletterSource; userId?: string | null }
): Promise<FireCapiEventResult> {
  const referer = req.headers.get("referer") ?? undefined
  const fbp = req.cookies.get("_fbp")?.value
  const fbc = req.cookies.get("_fbc")?.value || buildFbcFromFbclid(extractFbclidFromUrl(referer))

  return fireCapiEvent(META_EVENT_NEWSLETTER_LEAD, {
    eventId: opts.eventId,
    eventSourceUrl: referer ?? "https://usethrml.com/",
    userData: {
      email: opts.email,
      externalId: opts.userId ?? undefined,
      clientIpAddress: getClientIpFromHeaders(req.headers),
      clientUserAgent: req.headers.get("user-agent") ?? undefined,
      fbp,
      fbc,
    },
    customData: { content_name: "newsletter_subscribe", content_category: opts.source },
    consentContext: { headers: req.headers, userId: opts.userId ?? undefined, admin },
  })
}
