import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

const POLICY_KEY = "dispute_resolution_v1"

export async function GET() {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  // Fetch regardless of is_active so the dashboard can show the toggle state
  const { data, error: qErr } = await admin
    .from("agent_policies")
    .select("id, policy_key, content, version, is_active, updated_at, created_at")
    .eq("policy_key", POLICY_KEY)
    .maybeSingle()

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 })
  }

  return NextResponse.json({
    policy: data ?? null,
  })
}

export async function PATCH(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  let body: { content?: unknown; is_active?: unknown }
  try {
    body = (await req.json()) as { content?: unknown; is_active?: unknown }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const isActiveToggle = typeof body.is_active === "boolean" ? body.is_active : undefined
  const content = typeof body.content === "string" ? body.content : null

  // Allow toggling is_active without requiring content
  if (isActiveToggle === undefined && (content === null || content.length < 1)) {
    return NextResponse.json({ error: "content or is_active is required" }, { status: 400 })
  }

  // Fetch the row regardless of current is_active state
  const { data: row, error: fetchErr } = await admin
    .from("agent_policies")
    .select("id, version")
    .eq("policy_key", POLICY_KEY)
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!row?.id) {
    return NextResponse.json({ error: "Active dispute policy row not found" }, { status: 404 })
  }

  const nextVersion = typeof row.version === "number" ? row.version + 1 : 1

  const patchPayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (isActiveToggle !== undefined) patchPayload.is_active = isActiveToggle
  if (content !== null) {
    patchPayload.content = content
    patchPayload.version = nextVersion
  }

  let upd = await admin.from("agent_policies").update(patchPayload).eq("id", row.id).select("*").maybeSingle()

  if (upd.error && isMissingColumn(upd.error.message)) {
    delete patchPayload.version
    upd = await admin.from("agent_policies").update(patchPayload).eq("id", row.id).select("*").maybeSingle()
  }

  if (upd.error) {
    return NextResponse.json({ error: upd.error.message }, { status: 500 })
  }

  return NextResponse.json({ policy: upd.data })
}

function isMissingColumn(message: string) {
  const m = message.toLowerCase()
  return m.includes("column") && m.includes("does not exist")
}
