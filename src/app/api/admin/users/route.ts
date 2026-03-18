import { NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

export async function GET() {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const [{ data: profiles, error: profilesError }, authUsersResponse] = await Promise.all([
    admin.from("profiles").select("*").order("created_at", { ascending: false }),
    admin.auth.admin.listUsers(),
  ])

  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 })

  const emailById = new Map<string, string | null>()
  for (const user of authUsersResponse.data.users ?? []) {
    emailById.set(user.id, user.email ?? null)
  }

  const users = (profiles ?? []).map((profile) => ({
    ...profile,
    email: emailById.get(String(profile.id)) ?? profile.email ?? null,
  }))

  return NextResponse.json({ users })
}
