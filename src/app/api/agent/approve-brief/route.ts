import { NextRequest, NextResponse } from "next/server"

import { processStaticBrief } from "@/lib/agent/static-generator"
import { parseStoredStaticVariations } from "@/lib/agent/host-monetization-static"
import { briefUsesSvgTemplate } from "@/lib/agent/svg-template-generator"
import { isConceptVerifyBrief, previewFormatForBrief } from "@/lib/agent/static-brief-plan"
import { expandStaticSizesFromAsset } from "@/lib/agent/static-preview-expand"
import { requireAdminApi } from "@/lib/admin-guard"

type StaticFormat = "1x1" | "4x5" | "9x16"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function formatsForBrief(format: unknown): StaticFormat[] {
  if (typeof format !== "string") return ["1x1"]

  const formats = new Set<StaticFormat>()
  for (const value of format.split(/[,/+\s]+/)) {
    if (value === "1x1" || value === "4x5" || value === "9x16") formats.add(value)
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
  const videoConfig =
    brief.video_config && typeof brief.video_config === "object" ? brief.video_config : null
  const isVideoBrief = Boolean(videoConfig)

  if (!isVideoBrief && !hasVisual && !staticPlan?.length && !briefUsesSvgTemplate(brief.trigger_data)) {
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

  if (isVideoBrief) {
    console.log("[agent/approve-brief] video brief approved; awaiting explicit generate-video", {
      briefId: data.id,
    })

    const queueUpdate = await admin!
      .from("creative_queue")
      .update({ approved_at: now, approved_by: "dom", status: "brief_ready" })
      .eq("brief_id", briefId)
    if (queueUpdate.error && queueUpdate.error.code !== "42703") {
      console.warn("[agent/approve-brief] creative_queue update failed", queueUpdate.error)
    }

    return NextResponse.json({ ok: true, briefId: data.id, video: true, generated: null })
  }

  try {
    const { data: existingAssets } = await admin!
      .from("creative_assets")
      .select("id, format, variation_label, created_at")
      .eq("brief_id", data.id)
      .order("created_at", { ascending: true })

    const conceptVerify = isConceptVerifyBrief(data)
    const previewFormat = previewFormatForBrief(data)

    if (conceptVerify && existingAssets?.length) {
      const anchor =
        existingAssets.find(
          (asset) =>
            (asset.variation_label ?? "A").toUpperCase().slice(0, 1) === "A" &&
            (asset.format === previewFormat || !asset.format),
        ) ?? existingAssets[0]

      const expanded = await expandStaticSizesFromAsset({ assetId: anchor.id })

      const queueUpdate = await admin!
        .from("creative_queue")
        .update({ approved_at: now, approved_by: "dom", status: "brief_ready" })
        .eq("brief_id", briefId)
      if (queueUpdate.error && queueUpdate.error.code !== "42703") {
        console.warn("[agent/approve-brief] creative_queue update failed", queueUpdate.error)
      }

      return NextResponse.json({
        ok: true,
        briefId: data.id,
        generated: expanded.generated,
        expanded: true,
      })
    }

    if (conceptVerify) {
      const generated = await processStaticBrief({
        briefId: data.id,
        variations: 1,
        formats: [previewFormat],
      })

      const queueUpdate = await admin!
        .from("creative_queue")
        .update({ approved_at: now, approved_by: "dom", status: "brief_ready" })
        .eq("brief_id", briefId)
      if (queueUpdate.error && queueUpdate.error.code !== "42703") {
        console.warn("[agent/approve-brief] creative_queue update failed", queueUpdate.error)
      }

      return NextResponse.json({ ok: true, briefId: data.id, generated, preview: true })
    }

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
