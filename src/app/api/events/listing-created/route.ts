import { NextRequest, NextResponse } from "next/server"

import { sendGA4Event } from "@/lib/analytics/measurement-protocol"
import {
  fireHostListingCapiEvents,
  newListingMetaEventIds,
} from "@/lib/meta/host-acquisition-events"
import { rateLimit } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

type Body = {
  event_id?: string
  first_listing_event_id?: string
  listing_id?: string
  client_id?: string
  event_source_url?: string
  fbp?: string
  fbc?: string
  fbclid?: string
  is_first_listing?: boolean
}

/** Secondary path for draft publish / legacy client flows — primary path is POST /api/listings. */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, {
    maxRequests: 30,
    windowMs: 60 * 1000,
    identifier: "listing-created",
  })
  if (limited) return limited

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const listingId = typeof body.listing_id === "string" ? body.listing_id.trim() : ""
  if (!listingId) {
    return NextResponse.json({ ok: false, error: "listing_id is required" }, { status: 400 })
  }

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .eq("host_id", user.id)
    .maybeSingle()

  if (listingError || !listing) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  const admin = createAdminClient()
  const { count } = await admin
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("host_id", user.id)

  const isFirstListing = body.is_first_listing === true || count === 1
  const ids = newListingMetaEventIds(isFirstListing)
  const hostListingCreatedEventId =
    typeof body.event_id === "string" && body.event_id.trim()
      ? body.event_id.trim()
      : ids.host_listing_created_event_id
  const hostFirstListingCreatedEventId =
    typeof body.first_listing_event_id === "string" && body.first_listing_event_id.trim()
      ? body.first_listing_event_id.trim()
      : ids.host_first_listing_created_event_id

  void fireHostListingCapiEvents(admin, user, {
    listingId,
    headers: req.headers,
    eventSourceUrl:
      typeof body.event_source_url === "string" && body.event_source_url.trim()
        ? body.event_source_url.trim()
        : req.headers.get("referer") ?? undefined,
    hostListingCreatedEventId,
    hostFirstListingCreatedEventId,
    isFirstListing,
    fbp: typeof body.fbp === "string" ? body.fbp : undefined,
    fbc: typeof body.fbc === "string" ? body.fbc : undefined,
    fbclid: typeof body.fbclid === "string" ? body.fbclid : undefined,
  }).catch((err) => {
    console.error("[CAPI] listing-created route async failed", err)
  })

  const clientId =
    typeof body.client_id === "string" && body.client_id.length > 0 ? body.client_id : user.id

  void sendGA4Event({
    clientId,
    events: [
      {
        name: "host_listing_created",
        params: {
          listing_id: listingId,
          engagement_time_msec: 100,
        },
      },
      ...(isFirstListing
        ? [
            {
              name: "host_first_listing_created",
              params: {
                listing_id: listingId,
                engagement_time_msec: 100,
              },
            },
          ]
        : []),
    ],
  })

  return NextResponse.json({
    ok: true,
    meta: {
      host_listing_created_event_id: hostListingCreatedEventId,
      host_first_listing_created_event_id: hostFirstListingCreatedEventId,
      is_first_listing: isFirstListing,
    },
  })
}
