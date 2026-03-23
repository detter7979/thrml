import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

export async function GET(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200)
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0)
  const platform = searchParams.get("platform")
  const action = searchParams.get("action")
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  let q = admin!.from("agent_decisions").select("*", { count: "exact" }).order("evaluated_at", { ascending: false })

  if (platform) q = q.eq("platform", platform)
  if (action) q = q.eq("action_taken", action)
  if (from) q = q.gte("evaluated_at", `${from}T00:00:00.000Z`)
  if (to) q = q.lte("evaluated_at", `${to}T23:59:59.999Z`)

  const { data, error: qErr, count } = await q.range(offset, offset + limit - 1)
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  return NextResponse.json({ decisions: data ?? [], total: count ?? data?.length ?? 0 })
}

export async function PATCH(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as { id?: string; overridden_by_human?: boolean } | null
  if (!body?.id || typeof body.overridden_by_human !== "boolean") {
    return NextResponse.json({ error: "Expected { id, overridden_by_human }" }, { status: 400 })
  }

  const { data, error: uErr } = await admin!
    .from("agent_decisions")
    .update({ overridden_by_human: body.overridden_by_human })
    .eq("id", body.id)
    .select("*")
    .maybeSingle()

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
  return NextResponse.json({ decision: data })
}
