import { NextResponse } from "next/server"

import { sendAccountDeletionRequestedEmail } from "@/lib/emails/account-deletion"
import { createClient } from "@/lib/supabase/server"

const GRACE_DAYS = 30

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, deletion_requested_at")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.deletion_requested_at) {
    return NextResponse.json({ success: true, alreadyRequested: true })
  }

  const now = new Date()
  const { error } = await supabase
    .from("profiles")
    .update({ deletion_requested_at: now.toISOString() })
    .eq("id", user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const graceEndsAt = new Date(now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000)
  const firstName =
    typeof profile?.full_name === "string" ? profile.full_name.split(/\s+/)[0] ?? null : null

  void sendAccountDeletionRequestedEmail({
    userId: user.id,
    email: user.email,
    firstName,
    graceEndsAt,
  })

  return NextResponse.json({ success: true, graceEndsAt: graceEndsAt.toISOString() })
}
