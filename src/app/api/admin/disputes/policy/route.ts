import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

const POLICY_KEY = "dispute_resolution_v1"

export async function GET() {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const { data, error: qErr } = await admin
    .from("agent_policies")
    .select("id, policy_key, content, version, is_active, updated_at, created_at")
    .eq("policy_key", POLICY_KEY)
    .eq("is_active", true)
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

  let body: { content?: unknown }
  try {
    body = (await req.json()) as { content?: unknown }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const content = typeof body.content === "string" ? body.content : null
  if (content === null || content.length < 1) {
    return NextResponse.json({ error: "content is required" }, { status: 400 })
  }

  const { data: row, error: fetchErr } = await admin
    .from("agent_policies")
    .select("id, version")
    .eq("policy_key", POLICY_KEY)
    .eq("is_active", true)
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!row?.id) {
    return NextResponse.json({ error: "Active dispute policy row not found" }, { status: 404 })
  }

  const nextVersion = typeof row.version === "number" ? row.version + 1 : 1

  const patchPayload: Record<string, unknown> = {
    content,
    updated_at: new Date().toISOString(),
    version: nextVersion,
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
