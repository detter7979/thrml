import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

const STATUSES = new Set(["PENDING", "IN_PROGRESS", "DONE"])

export async function GET(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const status = new URL(req.url).searchParams.get("status")
  let q = admin!.from("creative_queue").select("*").order("created_at", { ascending: false })
  if (status) q = q.eq("status", status)

  const { data, error: qErr } = await q
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as { id?: string; status?: string } | null
  if (!body?.id || !body.status) {
    return NextResponse.json({ error: "Expected { id, status }" }, { status: 400 })
  }
  if (!STATUSES.has(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  const { data, error: uErr } = await admin!
    .from("creative_queue")
    .update({ status: body.status })
    .eq("id", body.id)
    .select("*")
    .maybeSingle()

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
