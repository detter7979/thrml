import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

type Params = { id: string }

const flagSchema = z.object({
  reason: z.string().trim().min(3).max(280),
})

export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { id } = await params
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = flagSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })

  const { data: review } = await supabase.from("listing_reviews").select("id, metadata").eq("id", id).maybeSingle()
  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 })

  const insertResult = await admin.from("review_flags").insert({
    review_id: id,
    user_id: user.id,
    reason: parsed.data.reason,
  })

  if (!insertResult.error) {
    return NextResponse.json({ success: true })
  }

  const metadata = (typeof review.metadata === "object" && review.metadata
    ? review.metadata
    : {}) as Record<string, unknown>

  const existingFlags = Array.isArray(metadata.flags) ? metadata.flags : []
  const nextMetadata = {
    ...metadata,
    flags: [
      ...existingFlags,
      {
        user_id: user.id,
        reason: parsed.data.reason,
        created_at: new Date().toISOString(),
      },
    ],
  }

  const { error: fallbackError } = await admin.from("listing_reviews").update({ metadata: nextMetadata }).eq("id", id)
  if (fallbackError) {
    return NextResponse.json({ error: fallbackError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
