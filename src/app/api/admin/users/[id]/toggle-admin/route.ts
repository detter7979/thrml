import { NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

export async function PATCH(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, admin, user } = await requireAdminApi()
  if (error || !admin || !user) return error

  if (id === user.id) {
    return NextResponse.json({ error: "You cannot remove your own admin access." }, { status: 400 })
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, is_admin")
    .eq("id", id)
    .maybeSingle()
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const nextIsAdmin = !Boolean(profile.is_admin)
  const { error: updateError } = await admin.from("profiles").update({ is_admin: nextIsAdmin }).eq("id", id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true, is_admin: nextIsAdmin })
}
