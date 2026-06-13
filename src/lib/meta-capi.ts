import crypto from "crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import { hasAdvertisingConsent, type AdvertisingConsentContext } from "@/lib/advertising-consent"
import { hashIfPresent } from "@/lib/analytics/hash-for-meta"
import { normalizeMetaPixelId } from "@/lib/analytics/env-ids"
import { sanitizeMetaAdEventData } from "@/lib/meta/sanitize-ad-event-data"

const GRAPH_VERSION = "v22.0"

export const META_EVENT_HOST_ONBOARDING_STARTED = "host_onboarding_started"
export const META_EVENT_HOST_LISTING_CREATED = "host_listing_created"
export const META_EVENT_HOST_FIRST_LISTING_CREATED = "host_first_listing_created"
/** Legacy alias still seen in older namer rows and reporting pivots. */
export const META_EVENT_LISTING_CREATED_LEGACY = "listing_created"

export type CapiUserDataInput = {
  email?: string | null
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
  externalId?: string | null
  clientIpAddress?: string | null
  clientUserAgent?: string | null
  fbp?: string | null
  fbc?: string | null
}

function pixelId(): string | null {
  return normalizeMetaPixelId(process.env.META_PIXEL_ID ?? process.env.NEXT_PUBLIC_META_PIXEL_ID)
}

function capiAccessToken(): string | null {
  return process.env.META_CAPI_ACCESS_TOKEN ?? process.env.META_CONVERSIONS_API_TOKEN ?? null
}

export function hashPhoneForMeta(phone?: string | null): string | undefined {
  if (!phone) return undefined
  const digits = phone.replace(/\D/g, "")
  if (!digits) return undefined
  return hashIfPresent(digits)
}

/** Build Meta CAPI user_data — hashed PII only, plus browser/network match keys. */
export function buildCapiUserData(input: CapiUserDataInput): Record<string, string> {
  const out: Record<string, string> = {}

  const em = hashIfPresent(input.email ?? undefined)
  const ph = hashPhoneForMeta(input.phone)
  const fn = hashIfPresent(input.firstName ?? undefined)
  const ln = hashIfPresent(input.lastName ?? undefined)
  const external_id = hashIfPresent(input.externalId ?? undefined)

  if (em) out.em = em
  if (ph) out.ph = ph
  if (fn) out.fn = fn
  if (ln) out.ln = ln
  if (external_id) out.external_id = external_id
  if (input.fbp?.trim()) out.fbp = input.fbp.trim()
  if (input.fbc?.trim()) out.fbc = input.fbc.trim()
  if (input.clientIpAddress?.trim()) out.client_ip_address = input.clientIpAddress.trim()
  if (input.clientUserAgent?.trim()) out.client_user_agent = input.clientUserAgent.trim()

  return out
}

export function getClientIpFromHeaders(headers: Headers): string | undefined {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const realIp = headers.get("x-real-ip")?.trim()
  return forwardedFor || realIp || undefined
}

/** Construct fbc from fbclid when the Pixel cookie is not yet set. */
export function buildFbcFromFbclid(fbclid?: string | null, createdAtMs = Date.now()): string | undefined {
  const id = fbclid?.trim()
  if (!id) return undefined
  const ts = Math.floor(createdAtMs / 1000)
  return `fb.1.${ts}.${id}`
}

export function extractFbclidFromUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).searchParams.get("fbclid") ?? undefined
  } catch {
    return undefined
  }
}

export type FireCapiEventOptions = {
  eventId?: string
  eventSourceUrl?: string
  userData: CapiUserDataInput
  customData?: Record<string, unknown>
  /** When set, CAPI is skipped unless advertising consent is granted. */
  consentContext?: AdvertisingConsentContext & { admin?: SupabaseClient }
  /** Internal — bypass consent check (never use for production ad events). */
  skipConsentCheck?: boolean
}

export type FireCapiEventResult = {
  ok: boolean
  eventId: string
  skipped?: string
  error?: string
}

/**
 * Send one event to Meta Conversions API. Never throws — callers use fire-and-forget.
 */
export async function fireCapiEvent(
  eventName: string,
  options: FireCapiEventOptions
): Promise<FireCapiEventResult> {
  const eventId = options.eventId ?? crypto.randomUUID()
  const pid = pixelId()
  const token = capiAccessToken()

  if (!options.skipConsentCheck) {
    const consentCtx: AdvertisingConsentContext = options.consentContext ?? {}
    if (!consentCtx.userId && options.userData.externalId) {
      consentCtx.userId = options.userData.externalId
    }
    const consented = await hasAdvertisingConsent(consentCtx)
    if (!consented) {
      console.debug(`[CAPI] ${eventName} skipped — no advertising consent`)
      return { ok: false, eventId, skipped: "no_advertising_consent" }
    }
  }

  if (!pid) {
    return { ok: false, eventId, skipped: "meta_pixel_unconfigured" }
  }
  if (!token) {
    return { ok: false, eventId, skipped: "meta_capi_unconfigured" }
  }

  const sanitizedCustom = sanitizeMetaAdEventData(options.customData)
  const user_data = buildCapiUserData(options.userData)
  const body: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_id: eventId,
        ...(options.eventSourceUrl ? { event_source_url: options.eventSourceUrl } : {}),
        user_data,
        ...(sanitizedCustom && Object.keys(sanitizedCustom).length > 0
          ? { custom_data: sanitizedCustom }
          : {}),
      },
    ],
  }
  if (process.env.META_TEST_EVENT_CODE) {
    body.test_event_code = process.env.META_TEST_EVENT_CODE
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pid}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    )

    if (!res.ok) {
      const details = await res.text()
      console.error(`[CAPI] ${eventName} request failed`, res.status, details)
      return { ok: false, eventId, error: details }
    }

    const logPayload: Record<string, unknown> = { event_id: eventId }
    if (options.userData.externalId) logPayload.host_id = options.userData.externalId
    if (options.customData?.listing_id) logPayload.listing_id = options.customData.listing_id
    console.log(`[CAPI] ${eventName} sent`, logPayload)

    return { ok: true, eventId }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[CAPI] ${eventName} send failed`, message)
    return { ok: false, eventId, error: message }
  }
}
