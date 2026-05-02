import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as { briefId?: string; brief_id?: string } | null
  const briefId = (body?.briefId ?? body?.brief_id ?? "").trim()
  if (!briefId) return NextResponse.json({ error: "Expected { briefId: string }" }, { status: 400 })

  const now = new Date().toISOString()
  const { data, error: updateError } = await admin!
    .from("creative_briefs")
    .update({ approved_at: now })
    .eq("id", briefId)
    .select("*")
    .maybeSingle()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Brief not found" }, { status: 404 })

  await admin!
    .from("creative_queue")
    .update({ approved_at: now, approved_by: "dom", status: "brief_ready" })
    .eq("brief_id", briefId)

  return NextResponse.json({ ok: true, brief: data })
}
