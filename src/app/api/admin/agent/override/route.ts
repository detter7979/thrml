import { NextRequest, NextResponse } from "next/server"

import { resumeAd, resumeAdSet } from "@/lib/agent/meta-api"
import { resumeAdGroup, resumeGoogleAd } from "@/lib/agent/google-ads-api"
import { requireAdminApi } from "@/lib/admin-guard"

export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as {
    decision_id?: string
    action?: "reactivate" | "confirm"
  } | null
  if (!body?.decision_id || !body.action) {
    return NextResponse.json({ error: "Expected { decision_id, action }" }, { status: 400 })
  }

  const { data: decision, error: dErr } = await admin!
    .from("agent_decisions")
    .select("*")
    .eq("id", body.decision_id)
    .maybeSingle()

  if (dErr || !decision) {
    return NextResponse.json({ error: dErr?.message ?? "Decision not found" }, { status: 404 })
  }

  if (body.action === "confirm") {
    const { error: uErr } = await admin!
      .from("agent_decisions")
      .update({
        overridden_by_human: true,
        human_confirmed_at: new Date().toISOString(),
      })
      .eq("id", body.decision_id)

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, confirmed: true })
  }

  if (decision.action_taken !== "PAUSED") {
    return NextResponse.json({ error: "Only PAUSED decisions can be reactivated" }, { status: 400 })
  }

  const platform = String(decision.platform)
  const entityType = String(decision.entity_type)
  let apiOk = false

  try {
    if (platform === "meta") {
      if (entityType === "adset") {
        apiOk = await resumeAdSet(String(decision.entity_id))
      } else {
        apiOk = await resumeAd(String(decision.entity_id))
      }
    } else if (platform === "google") {
      if (entityType === "adset") {
        apiOk = await resumeAdGroup(String(decision.entity_id))
      } else {
        const parent = decision.parent_entity_id ? String(decision.parent_entity_id) : ""
        if (!parent) {
          return NextResponse.json({ error: "Decision missing parent_entity_id for Google ad" }, { status: 400 })
        }
        apiOk = await resumeGoogleAd(parent, String(decision.entity_id))
      }
    } else {
      return NextResponse.json({ error: "Unknown platform" }, { status: 400 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "API error"
    return NextResponse.json({ ok: false, reactivated: false, error: msg }, { status: 502 })
  }

  if (apiOk) {
    await admin!
      .from("agent_decisions")
      .update({ overridden_by_human: true })
      .eq("id", body.decision_id)
  }

  return NextResponse.json({ ok: apiOk, reactivated: apiOk })
}
