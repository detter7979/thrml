import type { SupabaseClient } from "@supabase/supabase-js"

/** First-party cookie readable server-side for advertising/Meta consent. */
export const AD_CONSENT_COOKIE = "thrml_ad_consent"
export const AD_CONSENT_ACCEPTED = "accepted"
export const AD_CONSENT_DECLINED = "declined"

export type AdConsentValue = typeof AD_CONSENT_ACCEPTED | typeof AD_CONSENT_DECLINED

export function parseAdConsentCookie(raw: string | null | undefined): AdConsentValue | null {
  if (raw === AD_CONSENT_ACCEPTED || raw === AD_CONSENT_DECLINED) return raw
  return null
}

export function readAdConsentFromCookieHeader(cookieHeader: string | null): AdConsentValue | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name === AD_CONSENT_COOKIE) {
      return parseAdConsentCookie(decodeURIComponent(rest.join("=")))
    }
  }
  return null
}

export function adConsentCookieValue(accepted: boolean): AdConsentValue {
  return accepted ? AD_CONSENT_ACCEPTED : AD_CONSENT_DECLINED
}

export function setAdConsentCookie(accepted: boolean) {
  if (typeof document === "undefined") return
  const value = adConsentCookieValue(accepted)
  const maxAge = 60 * 60 * 24 * 365
  document.cookie = `${AD_CONSENT_COOKIE}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`
}

export type AdvertisingConsentContext = {
  headers?: Headers
  cookieHeader?: string | null
  userId?: string | null
  admin?: SupabaseClient
}

/**
 * Returns true only when advertising consent is explicitly granted.
 * Checks cookie first, then profile.marketing_consent for logged-in users.
 */
export async function hasAdvertisingConsent(ctx: AdvertisingConsentContext): Promise<boolean> {
  const cookieHeader = ctx.cookieHeader ?? ctx.headers?.get("cookie") ?? null
  const fromCookie = readAdConsentFromCookieHeader(cookieHeader)
  if (fromCookie === AD_CONSENT_ACCEPTED) return true
  if (fromCookie === AD_CONSENT_DECLINED) return false

  if (ctx.userId && ctx.admin) {
    const { data } = await ctx.admin
      .from("profiles")
      .select("marketing_consent")
      .eq("id", ctx.userId)
      .maybeSingle()
    if (data?.marketing_consent === true) return true
    if (data?.marketing_consent === false) return false
  }

  return false
}
