import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

const EDITABLE = new Set([
  "is_active",
  "target_cpa",
  "max_cpa_multiplier",
  "scale_threshold",
  "min_spend_to_evaluate",
  "max_days_no_purchase",
  "min_ctr_pct",
  "min_spend_for_ctr",
  "budget_scale_pct",
  "target_cpa_prospecting",
  "target_cpa_retargeting",
  "warn_days_before_reduce",
  "reduce_days_before_pause",
  "min_conversions_to_scale",
  "ab_test_cpa_threshold",
])

export async function GET() {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const { data, error: qErr } = await admin!
    .from("agent_config")
    .select("*")
    .order("platform")
    .order("goal_type")
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
  return NextResponse.json({ configs: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as {
    platform?: string
    goal_type?: string
    field?: string
    value?: unknown
  } | null
  if (!body?.platform || !body.field || body.value === undefined) {
    return NextResponse.json({ error: "Expected { platform, goal_type, field, value }" }, { status: 400 })
  }
  const goalType = body.goal_type === "host" ? "host" : "guest"
  if (!EDITABLE.has(body.field)) {
    return NextResponse.json({ error: "Field not editable" }, { status: 400 })
  }

  const { data, error: uErr } = await admin!
    .from("agent_config")
    .update({ [body.field]: body.value, updated_at: new Date().toISOString() })
    .eq("platform", body.platform)
    .eq("goal_type", goalType)
    .select("*")
    .maybeSingle()

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
  return NextResponse.json({ config: data })
}
