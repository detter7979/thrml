import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function GET(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim()
  if (q.length < 2) {
    return NextResponse.json({ users: [] as { id: string; full_name: string | null; email: string | null }[] })
  }

  let profiles: { id: string; full_name: string | null }[] = []

  if (isUuid(q)) {
    const { data: row } = await admin.from("profiles").select("id, full_name").eq("id", q).maybeSingle()
    profiles = row ? [row] : []
  } else {
    const { data: rows, error: pErr } = await admin
      .from("profiles")
      .select("id, full_name")
      .ilike("full_name", `%${q}%`)
      .limit(25)
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    profiles = rows ?? []
  }

  const users = await Promise.all(
    profiles.map(async (p) => {
      const { data: auth } = await admin.auth.admin.getUserById(p.id)
      return {
        id: p.id,
        full_name: p.full_name,
        email: auth.user?.email ?? null,
      }
    })
  )

  return NextResponse.json({ users })
}
