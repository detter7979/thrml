import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { applyMemoryRateLimit, requestIp } from "@/lib/security"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const saveListingSchema = z.object({
  listing_id: z.string().uuid(),
})

export async function GET() {
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: savedRows, error: savedError } = await admin
    .from("saved_listings")
    .select("listing_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (savedError) {
    return NextResponse.json({ error: savedError.message }, { status: 500 })
  }

  const listingIds = (savedRows ?? [])
    .map((row) => (typeof row.listing_id === "string" ? row.listing_id : null))
    .filter((value): value is string => Boolean(value))

  const { data: listingsData, error: listingsError } = listingIds.length
    ? await admin
        .from("listings")
        .select(
          `
            id, title, service_type, session_type,
            price_solo, fixed_session_price,
            location_city, lat, lng,
            listing_photos (url, order_index),
            listing_ratings (avg_overall, review_count)
          `
        )
        .in("id", listingIds)
    : { data: [], error: null }

  if (listingsError) {
    return NextResponse.json({ error: listingsError.message }, { status: 500 })
  }

  const listingsById = new Map((listingsData ?? []).map((listing) => [listing.id as string, listing]))
  const saved = (savedRows ?? []).map((row) => ({
    listing_id: row.listing_id,
    created_at: row.created_at,
    listings: listingsById.get(row.listing_id) ?? null,
  }))

  return NextResponse.json({ saved })
}

export async function POST(req: NextRequest) {
  const ip = requestIp(req)
  const limit = applyMemoryRateLimit({
    key: `api:saved:post:${ip}`,
    max: 30,
    windowMs: 60_000,
  })
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again." }, { status: 429 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = saveListingSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "listing_id is required" }, { status: 400 })
  const listingId = parsed.data.listing_id

  const { error } = await supabase.from("saved_listings").insert({
    user_id: user.id,
    listing_id: listingId,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
