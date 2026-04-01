import { NextRequest, NextResponse } from "next/server"

import { hashIfPresent } from "@/lib/analytics/hash-for-meta"
import { sendGA4Event } from "@/lib/analytics/measurement-protocol"
import { rateLimit } from "@/lib/rate-limit"
import { createClient } from "@/lib/supabase/server"

type Body = {
  event_id?: string
  listing_id?: string
  client_id?: string
  fbp?: string
  fbc?: string
}

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

  const eventId = typeof body.event_id === "string" ? body.event_id : ""
  const listingId = typeof body.listing_id === "string" ? body.listing_id : ""
  if (!eventId || !listingId) {
    return NextResponse.json({ ok: false, error: "event_id and listing_id are required" }, { status: 400 })
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

  const clientId = typeof body.client_id === "string" && body.client_id.length > 0 ? body.client_id : user.id

  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "922697217019242"
  const accessToken = process.env.META_CONVERSIONS_API_TOKEN

  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const userAgent = req.headers.get("user-agent") ?? undefined
  const emailHash = hashIfPresent(user.email ?? undefined)

  if (pixelId && accessToken) {
    const userData = {
      ...(emailHash ? { em: emailHash } : {}),
      ...(body.fbp ? { fbp: body.fbp } : {}),
      ...(body.fbc ? { fbc: body.fbc } : {}),
      ...(forwardedFor ? { client_ip_address: forwardedFor } : {}),
      ...(userAgent ? { client_user_agent: userAgent } : {}),
    }

    const capiBody = {
      data: [
        {
          event_name: "listing_created",
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: "website",
          event_source_url: req.headers.get("referer") ?? undefined,
          user_data: userData,
          custom_data: {
            content_id: listingId,
            content_type: "product",
          },
        },
      ],
      ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v22.0/${pixelId}/events?access_token=${accessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(capiBody),
        }
      )

      if (!response.ok) {
        const details = await response.text()
        console.error("[Meta CAPI listing_created] Request failed", response.status, details)
      }
    } catch (error) {
      console.error("[Meta CAPI listing_created] Send failed", error)
    }
  } else {
    console.warn("[Meta CAPI listing_created] Missing pixel id or META_CONVERSIONS_API_TOKEN")
  }

  void sendGA4Event({
    clientId,
    events: [
      {
        name: "listing_created",
        params: {
          listing_id: listingId,
          engagement_time_msec: 100,
        },
      },
    ],
  })

  return NextResponse.json({ ok: true })
}
