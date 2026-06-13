import { NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"

const GRACE_MS = 30 * 24 * 60 * 60 * 1000
const ANONYMIZED_EMAIL_DOMAIN = "deleted.usethrml.com"

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const supplied =
    req.headers.get("cron_secret") ??
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "")

  if (!secret || supplied !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - GRACE_MS).toISOString()

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, deletion_requested_at")
    .not("deletion_requested_at", "is", null)
    .lte("deletion_requested_at", cutoff)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let anonymized = 0
  for (const row of profiles ?? []) {
    const userId = row.id as string
    const placeholderEmail = `deleted+${userId.slice(0, 8)}@${ANONYMIZED_EMAIL_DOMAIN}`

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        full_name: "Deleted User",
        first_name: null,
        last_name: null,
        phone: null,
        avatar_url: null,
        is_deleted: true,
        deletion_requested_at: null,
      })
      .eq("id", userId)

    if (profileError) {
      console.error("[cron/anonymize-deleted-accounts] profile update failed", userId, profileError.message)
      continue
    }

    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      email: placeholderEmail,
      user_metadata: { full_name: "Deleted User" },
    })

    if (authError) {
      console.error("[cron/anonymize-deleted-accounts] auth update failed", userId, authError.message)
    }

    anonymized += 1
  }

  return NextResponse.json({ ok: true, anonymized })
}
