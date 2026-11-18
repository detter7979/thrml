import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAuth } from "@/lib/auth-check"
import { rateLimit } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"

const registerSchema = z.object({
  token: z.string().trim().min(16).max(512),
  platform: z.enum(["ios", "android"]).default("ios"),
  appVersion: z.string().trim().max(32).optional(),
})

const removeSchema = z.object({ token: z.string().trim().min(16).max(512) })

/** The iOS app registers its push token here after the person allows notifications. */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { maxRequests: 20, windowMs: 60 * 1000, identifier: "push-devices" })
  if (limited) return limited

  const { error: authError, session } = await requireAuth()
  if (authError || !session) return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = registerSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })

  const now = new Date().toISOString()
  // A token belongs to one device; if someone else signs in on that phone it moves to them.
  const { error } = await createAdminClient()
    .from("push_devices")
    .upsert(
      {
        user_id: session.user.id,
        token: parsed.data.token,
        platform: parsed.data.platform,
        app_version: parsed.data.appVersion ?? null,
        last_seen_at: now,
        disabled_at: null,
      },
      { onConflict: "token" }
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** Called on sign-out so a shared phone stops getting the previous person's notifications. */
export async function DELETE(req: NextRequest) {
  const { error: authError, session } = await requireAuth()
  if (authError || !session) return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = removeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })

  const { error } = await createAdminClient()
    .from("push_devices")
    .delete()
    .eq("token", parsed.data.token)
    .eq("user_id", session.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
