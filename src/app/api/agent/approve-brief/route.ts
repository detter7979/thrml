import { NextRequest, NextResponse } from "next/server"

import { processStaticBrief } from "@/lib/agent/static-generator"
import { parseStoredStaticVariations } from "@/lib/agent/host-monetization-static"
import { requireAdminApi } from "@/lib/admin-guard"

type StaticFormat = "1x1" | "9x16"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function formatsForBrief(format: unknown): StaticFormat[] {
  if (typeof format !== "string") return ["1x1"]

  const formats = new Set<StaticFormat>()
  for (const value of format.split(/[,/+\s]+/)) {
    if (value === "1x1" || value === "9x16") formats.add(value)
  }
  return formats.size > 0 ? Array.from(formats) : ["1x1"]
}

export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as { briefId?: string; brief_id?: string } | null
  const briefId = (body?.briefId ?? body?.brief_id ?? "").trim()
  if (!briefId) return NextResponse.json({ error: "Expected { briefId: string }" }, { status: 400 })

  const { data: brief, error: briefError } = await admin!
    .from("creative_briefs")
    .select("*")
    .eq("id", briefId)
    .maybeSingle()

  if (briefError) return NextResponse.json({ error: briefError.message }, { status: 500 })
  if (!brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 })
  const staticPlan = parseStoredStaticVariations(brief.trigger_data)
  const hasVisual = typeof brief.visual_direction === "string" && brief.visual_direction.trim()
  if (!hasVisual && !staticPlan?.length) {
    return NextResponse.json({ error: "Brief needs a visual direction before approval." }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data, error: updateError } = await admin!
    .from("creative_briefs")
    .update({ status: "approved", approved_at: now })
    .eq("id", briefId)
    .select("*")
    .maybeSingle()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Brief not found" }, { status: 404 })

  try {
    const generated = await processStaticBrief({
      briefId: data.id,
      formats: formatsForBrief(data.format),
    })

    const queueUpdate = await admin!
      .from("creative_queue")
      .update({ approved_at: now, approved_by: "dom", status: "brief_ready" })
      .eq("brief_id", briefId)
    if (queueUpdate.error && queueUpdate.error.code !== "42703") {
      console.warn("[agent/approve-brief] creative_queue update failed", queueUpdate.error)
    }

    return NextResponse.json({ ok: true, briefId: data.id, generated })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Static generation failed"
    console.error("[agent/approve-brief] static generation failed", err)

    await admin!
      .from("creative_briefs")
      .update({ status: "briefed", approved_at: null })
      .eq("id", briefId)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
