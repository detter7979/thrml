import { NextRequest, NextResponse } from "next/server"

import { assertHostInsuranceAttested } from "@/lib/host/insurance-attestation"
import { assertPublishableListingCopy } from "@/lib/listings/host-claim-policy"
import { insertListingWithColumnFallback } from "@/lib/listings/insert-listing"
import {
  listingPayloadCoerceKeySummary,
  normalizeListingInsertPayload,
  sanitizeHouseRulesForListing,
} from "@/lib/listings/normalize-listing-insert-payload"
import { rateLimit } from "@/lib/rate-limit"
import { sanitizeText } from "@/lib/sanitize"
import { createClient } from "@/lib/supabase/server"

function errorFromUnknown(err: unknown): { message: string; code: string | null } {
  if (err && typeof err === "object") {
    const record = err as { message?: unknown; code?: unknown }
    return {
      message: typeof record.message === "string" ? record.message : "Internal server error",
      code: typeof record.code === "string" ? record.code : null,
    }
  }
  if (typeof err === "string") {
    return { message: err, code: null }
  }
  return { message: "Internal server error", code: null }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> | null = null

  try {
    const limited = await rateLimit(request, {
      maxRequests: 20,
      windowMs: 60 * 60 * 1000,
      identifier: "listings-create",
    })
    if (limited) return limited

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid listing payload." }, { status: 400 })
    }

    const title = typeof body.title === "string" ? sanitizeText(body.title) : ""
    const description = typeof body.description === "string" ? sanitizeText(body.description) : ""

    if (title.length < 6) {
      return NextResponse.json({ error: "Title must be at least 6 characters." }, { status: 400 })
    }
    if (description.length < 100) {
      return NextResponse.json({ error: "Description must be at least 100 characters." }, { status: 400 })
    }

    const claimCheck = assertPublishableListingCopy({ title, description })
    if (!claimCheck.ok) {
      return NextResponse.json({ error: claimCheck.error }, { status: 400 })
    }

    const attestationCheck = await assertHostInsuranceAttested(supabase, user.id)
    if (!attestationCheck.ok) {
      return NextResponse.json({ error: attestationCheck.error }, { status: 400 })
    }

    const listingPayload = normalizeListingInsertPayload({
      ...body,
      host_id: user.id,
      title,
      description,
      house_rules: sanitizeHouseRulesForListing(body.house_rules),
      is_active: true,
      is_draft: false,
    })

    delete listingPayload.id
    delete listingPayload.created_at
    delete listingPayload.updated_at
    delete listingPayload.is_featured

    const { data, error, code } = await insertListingWithColumnFallback(supabase, listingPayload)
    if (!data) {
      return NextResponse.json(
        { error: error ?? "Failed to create listing.", code: code ?? null },
        { status: 500 }
      )
    }

    return NextResponse.json({ listingId: data.id })
  } catch (err) {
    const { message, code } = errorFromUnknown(err)
    console.error("[POST /api/listings] failed", {
      message,
      code,
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5) : undefined,
      payloadKeys: Object.keys(body ?? {}),
      payloadCoerceTypes: listingPayloadCoerceKeySummary(body),
    })
    return NextResponse.json({ error: message, code }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const limited = await rateLimit(request, {
    maxRequests: 60,
    windowMs: 60 * 1000,
    identifier: "listings",
  })
  if (limited) return limited

  const supabase = await createClient()
  /** Card-oriented fields only: no description, host_id, or extra pricing tiers — keeps payload small. */
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, title, service_type, session_type, is_featured, fixed_session_price, price_solo, location, location_address, location_city, location_state, city, state, country, lat, lng, created_at, listing_photos(url, order_index), listing_ratings(avg_overall, review_count)"
    )
    .eq("is_active", true)
    .eq("is_deleted", false)
    .eq("is_draft", false)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(250)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const listings = (data ?? []).map((listing: Record<string, unknown>) => {
    const city =
      typeof listing.city === "string"
        ? listing.city
        : typeof listing.location_city === "string"
          ? listing.location_city
          : ""
    const state =
      typeof listing.state === "string"
        ? listing.state
        : typeof listing.location_state === "string"
          ? listing.location_state
          : ""
    const country = typeof listing.country === "string" ? listing.country : ""
    const parts = [city, state, country].filter((part) => part.length > 0)
    const derivedLocation = parts.join(", ")
    const fallbackLocation =
      typeof listing.location === "string" ? listing.location : "Location available after booking"

    return {
      ...listing,
      service_type: typeof listing.service_type === "string" ? listing.service_type : "sauna",
      location: derivedLocation || fallbackLocation,
    }
  })

  return NextResponse.json(
    { listings },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    }
  )
}
