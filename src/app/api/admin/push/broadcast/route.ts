import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAdminApi } from "@/lib/admin-guard"
import { sendPushToUser } from "@/lib/push/send"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Marketing push to app users, mirroring the email opt-ins:
 *   wellness_tips   → "Wellness tips and new spaces near you" (e.g. a new sauna nearby)
 *   offers          → "Exclusive offers and promotions"
 *   product_updates → "Product updates from thrml"
 * Only people who turned that email preference on (and haven't turned push off) receive it.
 * Send { dryRun: true } first to see how many devices it would reach.
 */
const schema = z.object({
  topic: z.enum(["wellness_tips", "offers", "product_updates"]),
  title: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(180),
  url: z.string().trim().max(300).optional(),
  dryRun: z.boolean().optional(),
})

const PREFERENCE = {
  wellness_tips: "marketing_wellness_tips",
  offers: "marketing_offers",
  product_updates: "marketing_product_updates",
} as const

export async function POST(req: NextRequest) {
  const { error } = await requireAdminApi()
  if (error) return error

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  const { topic, title, body, url, dryRun } = parsed.data
  const preferenceKey = PREFERENCE[topic]

  const admin = createAdminClient()
  const { data: devices, error: devicesError } = await admin
    .from("push_devices")
    .select("user_id")
    .is("disabled_at", null)
  if (devicesError) return NextResponse.json({ error: devicesError.message }, { status: 500 })

  const userIds = [...new Set((devices ?? []).map((device) => device.user_id as string))]
  if (dryRun) {
    const { data: profiles } = await admin.from("profiles").select("id, notification_preferences").in("id", userIds)
    const optedIn = (profiles ?? []).filter((profile) => {
      const prefs = (profile.notification_preferences ?? {}) as Record<string, unknown>
      return prefs[preferenceKey] === true && prefs.push_enabled !== false
    })
    return NextResponse.json({ dryRun: true, usersWithApp: userIds.length, wouldReach: optedIn.length })
  }

  let sent = 0
  for (const userId of userIds) {
    const result = await sendPushToUser(userId, { title, body, url, preferenceKey })
    sent += result.sent
  }
  return NextResponse.json({ ok: true, usersWithApp: userIds.length, devicesNotified: sent })
}
