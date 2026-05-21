import { NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

/** ~100 years — effectively permanent for Supabase Auth ban_duration. */
const PERMANENT_BAN_DURATION = "876000h"

export async function PATCH(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, admin, user } = await requireAdminApi()
  if (error || !admin || !user) return error

  if (id === user.id) {
    return NextResponse.json({ error: "You cannot ban your own account." }, { status: 400 })
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, is_admin, is_banned")
    .eq("id", id)
    .maybeSingle()
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const nextIsBanned = !Boolean(profile.is_banned)

  if (nextIsBanned && profile.is_admin) {
    return NextResponse.json(
      { error: "Remove admin access before banning this user." },
      { status: 400 }
    )
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      is_banned: nextIsBanned,
      banned_at: nextIsBanned ? new Date().toISOString() : null,
    })
    .eq("id", id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const { error: authError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: nextIsBanned ? PERMANENT_BAN_DURATION : "none",
  })
  if (authError) {
    await admin
      .from("profiles")
      .update({ is_banned: Boolean(profile.is_banned) })
      .eq("id", id)
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, is_banned: nextIsBanned })
}
