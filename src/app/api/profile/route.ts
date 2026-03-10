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

function hasAnyMarketingOptIn(preferences: Record<string, boolean>) {
  return Boolean(
    preferences.marketing_wellness_tips ||
      preferences.marketing_offers ||
      preferences.marketing_product_updates
  )
}

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
    let existingNotificationPreferences: Record<string, unknown> = {}

    const { data: existingById } = await supabase
      .from("profiles")
      .select("notification_preferences")
      .eq("id", user.id)
      .maybeSingle()
    if (existingById?.notification_preferences && typeof existingById.notification_preferences === "object") {
      existingNotificationPreferences = existingById.notification_preferences as Record<string, unknown>
    } else {
      const { data: existingByUserId, error: existingByUserIdError } = await supabase
        .from("profiles")
        .select("notification_preferences")
        .eq("user_id", user.id)
        .maybeSingle()
      const isMissingUserIdColumn = Boolean(
        existingByUserIdError?.message?.includes("column profiles.user_id does not exist")
      )
      if (!isMissingUserIdColumn && existingByUserId?.notification_preferences && typeof existingByUserId.notification_preferences === "object") {
        existingNotificationPreferences = existingByUserId.notification_preferences as Record<string, unknown>
      }
    }

    updates.notification_preferences = normalizeNotificationPreferences({
      ...existingNotificationPreferences,
      ...updates.notification_preferences,
    })
  }

  if (updates.notification_preferences && updates.newsletter_opted_in === undefined) {
    updates.newsletter_opted_in = hasAnyMarketingOptIn(updates.notification_preferences)
  }

  let updateError: { message: string } | null = null
  let hasPersistedChanges = false

  const { data: updatedRowsById, error: updateByIdError } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select("id")
  if (updateByIdError) {
    updateError = updateByIdError
  } else {
    hasPersistedChanges = Boolean(updatedRowsById?.length)
  }

  if (!updateError && !hasPersistedChanges) {
    const { data: updatedRowsByUserId, error: updateByUserIdError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("user_id", user.id)
      .select("id")
    const isMissingUserIdColumn = Boolean(updateByUserIdError?.message?.includes("column profiles.user_id does not exist"))
    if (!isMissingUserIdColumn && updateByUserIdError) {
      updateError = updateByUserIdError
    } else if (!updateByUserIdError) {
      hasPersistedChanges = Boolean(updatedRowsByUserId?.length)
    }
  }

  if (!updateError && !hasPersistedChanges) {
    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert({ id: user.id, ...updates }, { onConflict: "id" })
    if (upsertError) {
      updateError = upsertError
    } else {
      hasPersistedChanges = true
    }
  }

  if (updateError || !hasPersistedChanges) {
    return NextResponse.json({ error: updateError?.message ?? "Unable to update profile." }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
