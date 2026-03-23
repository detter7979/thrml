import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

const STATUSES = new Set(["RUNNING", "WINNER_A", "WINNER_B", "INCONCLUSIVE"])

export async function GET() {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const { data, error: qErr } = await admin!
    .from("ab_test_log")
    .select("*")
    .order("created_at", { ascending: false })

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
  return NextResponse.json({ tests: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as {
    id?: string
    status?: string
    winner_id?: string | null
    notes?: string | null
  } | null

  if (!body?.id) {
    return NextResponse.json({ error: "Expected { id, status?, winner_id?, notes? }" }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (!STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }
    patch.status = body.status
  }
  if (body.winner_id !== undefined) patch.winner_id = body.winner_id
  if (body.notes !== undefined) patch.notes = body.notes

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const { data, error: uErr } = await admin!
    .from("ab_test_log")
    .update(patch)
    .eq("id", body.id)
    .select("*")
    .maybeSingle()

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
  return NextResponse.json({ test: data })
}
