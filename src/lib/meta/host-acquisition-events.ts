import crypto from "crypto"
import type { SupabaseClient, User } from "@supabase/supabase-js"

import {
  buildFbcFromFbclid,
  extractFbclidFromUrl,
  fireCapiEvent,
  getClientIpFromHeaders,
  META_EVENT_HOST_FIRST_LISTING_CREATED,
  META_EVENT_HOST_LISTING_CREATED,
  META_EVENT_HOST_ONBOARDING_STARTED,
  type CapiUserDataInput,
  type FireCapiEventOptions,
} from "@/lib/meta-capi"

type ProfileRow = {
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  host_onboarding_started_at?: string | null
}

export type HostOnboardingStartedContext = {
  eventId: string
  headers: Headers
  eventSourceUrl?: string
  fbp?: string
  fbc?: string
  fbclid?: string
}

export type HostListingCapiContext = {
  listingId: string
  headers: Headers
  eventSourceUrl?: string
  hostListingCreatedEventId: string
  hostFirstListingCreatedEventId?: string
  isFirstListing: boolean
  fbp?: string
  fbc?: string
  fbclid?: string
}

function splitName(fullName?: string | null): { firstName?: string; lastName?: string } {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  if (parts.length === 1) return { firstName: parts[0] }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}

export function buildHostCapiUserData(
  user: User,
  profile: ProfileRow | null | undefined,
  headers: Headers,
  cookies?: { fbp?: string; fbc?: string; fbclid?: string; eventSourceUrl?: string }
): CapiUserDataInput {
  const fromProfile = splitName(profile?.full_name)
  const fbc =
    cookies?.fbc?.trim() ||
    buildFbcFromFbclid(cookies?.fbclid ?? extractFbclidFromUrl(cookies?.eventSourceUrl))

  return {
    email: user.email ?? undefined,
    phone: profile?.phone ?? undefined,
    firstName: profile?.first_name ?? fromProfile.firstName,
    lastName: profile?.last_name ?? fromProfile.lastName,
    externalId: user.id,
    clientIpAddress: getClientIpFromHeaders(headers),
    clientUserAgent: headers.get("user-agent") ?? undefined,
    fbp: cookies?.fbp,
    fbc,
  }
}

function capiOptions(
  userData: CapiUserDataInput,
  ctx: { eventId: string; eventSourceUrl?: string; customData?: Record<string, unknown> }
): FireCapiEventOptions {
  return {
    eventId: ctx.eventId,
    eventSourceUrl: ctx.eventSourceUrl,
    userData,
    customData: ctx.customData,
  }
}

/**
 * Fire host_onboarding_started once per user (profiles.host_onboarding_started_at).
 * Entry: first authenticated visit to /dashboard/host/new after host terms acceptance.
 */
export async function maybeFireHostOnboardingStarted(
  admin: SupabaseClient,
  user: User,
  ctx: HostOnboardingStartedContext
): Promise<{ fired: boolean; reason?: string }> {
  const now = new Date().toISOString()
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ host_onboarding_started_at: now })
    .eq("id", user.id)
    .is("host_onboarding_started_at", null)
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("[CAPI] host_onboarding_started idempotency update failed", error.message)
    return { fired: false, reason: "profile_update_failed" }
  }
  if (!updated) {
    return { fired: false, reason: "already_recorded" }
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, first_name, last_name, phone")
    .eq("id", user.id)
    .maybeSingle()

  const userData = buildHostCapiUserData(user, profile, ctx.headers, {
    fbp: ctx.fbp,
    fbc: ctx.fbc,
    fbclid: ctx.fbclid,
    eventSourceUrl: ctx.eventSourceUrl,
  })

  void fireCapiEvent(
    META_EVENT_HOST_ONBOARDING_STARTED,
    capiOptions(userData, {
      eventId: ctx.eventId,
      eventSourceUrl: ctx.eventSourceUrl ?? "https://usethrml.com/dashboard/host/new",
      customData: { content_name: "Host Onboarding" },
    })
  ).catch((err) => {
    console.error("[CAPI] host_onboarding_started async failed", err)
  })

  return { fired: true }
}

export async function fireHostListingCapiEvents(
  admin: SupabaseClient,
  user: User,
  ctx: HostListingCapiContext
): Promise<void> {
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, first_name, last_name, phone")
    .eq("id", user.id)
    .maybeSingle()

  const userData = buildHostCapiUserData(user, profile, ctx.headers, {
    fbp: ctx.fbp,
    fbc: ctx.fbc,
    fbclid: ctx.fbclid,
    eventSourceUrl: ctx.eventSourceUrl,
  })

  const listingCustom = {
    content_id: ctx.listingId,
    content_type: "product",
    listing_id: ctx.listingId,
  }

  void fireCapiEvent(
    META_EVENT_HOST_LISTING_CREATED,
    capiOptions(userData, {
      eventId: ctx.hostListingCreatedEventId,
      eventSourceUrl: ctx.eventSourceUrl ?? "https://usethrml.com/dashboard/host/new",
      customData: listingCustom,
    })
  ).catch((err) => {
    console.error("[CAPI] host_listing_created async failed", err)
  })

  if (ctx.isFirstListing && ctx.hostFirstListingCreatedEventId) {
    void fireCapiEvent(
      META_EVENT_HOST_FIRST_LISTING_CREATED,
      capiOptions(userData, {
        eventId: ctx.hostFirstListingCreatedEventId,
        eventSourceUrl: ctx.eventSourceUrl ?? "https://usethrml.com/dashboard/host/new",
        customData: listingCustom,
      })
    ).catch((err) => {
      console.error("[CAPI] host_first_listing_created async failed", err)
    })
  }
}

export function newListingMetaEventIds(isFirstListing: boolean) {
  return {
    host_listing_created_event_id: crypto.randomUUID(),
    host_first_listing_created_event_id: isFirstListing ? crypto.randomUUID() : undefined,
  }
}
