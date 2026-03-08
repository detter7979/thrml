import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { normalizeNotificationPreferences } from "@/lib/notification-preferences"
import { createClient } from "@/lib/supabase/server"

const updateSchema = z
  .object({
    terms_accepted: z.boolean().optional(),
    terms_accepted_at: z.string().datetime().optional(),
    terms_version: z.string().trim().max(32).optional(),
    waiver_accepted: z.boolean().optional(),
    newsletter_opted_in: z.boolean().optional(),
    newsletter_opted_in_at: z.string().datetime().optional(),
    offers_opted_in: z.boolean().optional(),
    product_updates_opted_in: z.boolean().optional(),
    notification_preferences: z.record(z.string(), z.boolean()).optional(),
  })
  .strict()

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid profile update payload." }, { status: 400 })
  const updates = parsed.data
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 })
  }

  if (updates.notification_preferences) {
    const { data: existing } = await supabase
      .from("profiles")
      .select("notification_preferences")
      .eq("id", user.id)
      .maybeSingle()

    updates.notification_preferences = normalizeNotificationPreferences({
      ...(existing?.notification_preferences && typeof existing.notification_preferences === "object"
        ? (existing.notification_preferences as Record<string, unknown>)
        : {}),
      ...updates.notification_preferences,
    })
  }

  const { error } = await supabase.from("profiles").update(updates).eq("id", user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
