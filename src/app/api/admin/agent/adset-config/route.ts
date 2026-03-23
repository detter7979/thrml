import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

const EDITABLE = new Set([
  "target_cpa_override",
  "warm_up_until",
  "audience_notes",
  "agent_managed",
])

export async function PATCH(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as {
    platform_id?: string
    platform?: string
    field?: string
    value?: unknown
  } | null

  if (!body?.platform_id || !body.platform || !body.field) {
    return NextResponse.json({ error: "Expected { platform_id, platform, field, value }" }, { status: 400 })
  }
  if (!EDITABLE.has(body.field)) {
    return NextResponse.json({ error: "Field not editable" }, { status: 400 })
  }
  if (body.value === undefined) {
    return NextResponse.json({ error: "value is required (use null to clear)" }, { status: 400 })
  }

  if (body.field === "target_cpa_override" && body.value !== null && typeof body.value === "number" && Number.isNaN(body.value)) {
    return NextResponse.json({ error: "Invalid target_cpa_override" }, { status: 400 })
  }

  const { data, error: uErr } = await admin!
    .from("adset_registry")
    .update({
      [body.field]: body.value,
      updated_at: new Date().toISOString(),
    })
    .eq("platform_id", body.platform_id)
    .eq("platform", body.platform)
    .select("*")
    .maybeSingle()

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Ad set not found" }, { status: 404 })
  return NextResponse.json({ adset: data })
}
