import { NextRequest, NextResponse } from "next/server"

import { baseVideoPath, gcsUrl } from "@/lib/agent/gcs-paths"
import { uploadRemoteToCreativeObject } from "@/lib/agent/gcs"
import { buildAdName, InvalidAdNameError } from "@/lib/agent/naming-builder"
import { generateVideo as runwayGenerate, pollTask } from "@/lib/agent/runway"
import type { VideoConfig } from "@/lib/agent/types"
import { formatPovVideoOverlay } from "@/lib/agent/video-template-copy"
import { requireAdminApi } from "@/lib/admin-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function isVideoConfig(value: unknown): value is VideoConfig {
  if (!value || typeof value !== "object") return false
  const config = value as VideoConfig
  return (
    (config.source === "runway" || config.source === "uploaded") &&
    typeof config.conceptSlug === "string" &&
    typeof config.assetSlug === "string" &&
    Array.isArray(config.copyVariants)
  )
}

export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as { briefId?: string } | null
  const briefId = body?.briefId?.trim()
  if (!briefId) {
    return NextResponse.json({ error: "briefId required" }, { status: 400 })
  }

  const { data: brief, error: briefErr } = await admin!
    .from("creative_briefs")
    .select("id, status, video_config, hook, trigger_data")
    .eq("id", briefId)
    .single()

  if (briefErr || !brief) {
    return NextResponse.json({ error: "brief not found" }, { status: 404 })
  }
  if (brief.status !== "approved") {
    return NextResponse.json(
      { error: `brief must be approved (current status: ${brief.status})` },
      { status: 400 }
    )
  }
  if (!brief.video_config || !isVideoConfig(brief.video_config)) {
    return NextResponse.json({ error: "brief has no video_config" }, { status: 400 })
  }

  const config = brief.video_config
  const triggerData =
    brief.trigger_data && typeof brief.trigger_data === "object"
      ? (brief.trigger_data as Record<string, unknown>)
      : {}
  const pathCategory = typeof triggerData.category === "string" ? triggerData.category : "Hosts"
  const pathAngleSlug =
    typeof triggerData.angle === "string"
      ? triggerData.angle
      : config.conceptSlug.replace(/-/g, "_")

  if (!config.copyVariants?.length) {
    return NextResponse.json({ error: "video_config.copyVariants is empty" }, { status: 400 })
  }
  if (config.source === "runway" && !config.runwayPrompt?.trim()) {
    return NextResponse.json({ error: "video_config.runwayPrompt required for runway source" }, { status: 400 })
  }
  if (config.source === "uploaded" && !config.uploadedGcsPath?.trim()) {
    return NextResponse.json(
      { error: "video_config.uploadedGcsPath required for uploaded source" },
      { status: 400 }
    )
  }

  if (config.naming) {
    for (const variant of config.copyVariants) {
      if (!variant.variant || !variant.angle) {
        return NextResponse.json(
          {
            error: `Brief naming error on variant "${variant.slug}": variant (A-D) and angle are required when naming is set`,
          },
          { status: 400 }
        )
      }
      try {
        buildAdName({
          testId: config.naming.testId,
          variant: variant.variant,
          angle: variant.angle,
          format: config.naming.format,
          cta: config.naming.cta,
        })
      } catch (err) {
        const message =
          err instanceof InvalidAdNameError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err)
        return NextResponse.json(
          { error: `Brief naming error on variant "${variant.slug}": ${message}` },
          { status: 400 }
        )
      }
    }
  }

  try {
    let baseGcsPath: string
    let baseSourceAssetId: string

    if (config.source === "runway") {
      const { taskId } = await runwayGenerate({
        prompt: config.runwayPrompt!,
        duration: config.duration ?? 5,
        ratio: config.ratio ?? "768:1280",
      })

      const task = await pollTask(taskId, { intervalMs: 5_000, timeoutMs: 4 * 60_000 })
      if (task.status !== "SUCCEEDED" || !task.output?.[0]) {
        return NextResponse.json(
          {
            error: `runway task ${task.status}`,
            detail: task.failure ?? task.failureCode ?? null,
          },
          { status: 502 }
        )
      }

      baseGcsPath = baseVideoPath({
        date: new Date(),
        conceptSlug: config.conceptSlug,
        assetSlug: config.assetSlug,
        source: "runway",
        taskId,
        category: pathCategory,
        angleSlug: pathAngleSlug,
      })

      const uploaded = await uploadRemoteToCreativeObject(task.output[0], baseGcsPath)

      const { data: assetRow, error: assetErr } = await admin!
        .from("creative_assets")
        .insert({
          brief_id: brief.id,
          asset_type: "video",
          generation_tool: "runway",
          gcs_path: uploaded.gcsPath,
          gcs_url: uploaded.gcsUrl,
          status: "generated",
          variation_label: "base",
        })
        .select("id")
        .single()

      if (assetErr || !assetRow) {
        return NextResponse.json(
          { error: "failed to insert base creative_asset", detail: assetErr?.message },
          { status: 500 }
        )
      }

      baseSourceAssetId = assetRow.id
    } else {
      baseGcsPath = config.uploadedGcsPath!.replace(/^gs:\/\/[^/]+\//, "")
      const fullGcsPath = gcsUrl(baseGcsPath)

      const { data: existing } = await admin!
        .from("creative_assets")
        .select("id")
        .eq("brief_id", brief.id)
        .eq("gcs_path", fullGcsPath)
        .maybeSingle()

      if (existing) {
        baseSourceAssetId = existing.id
      } else {
        const { data: assetRow, error: assetErr } = await admin!
          .from("creative_assets")
          .insert({
            brief_id: brief.id,
            asset_type: "video",
            generation_tool: "manual",
            gcs_path: fullGcsPath,
            status: "generated",
            variation_label: "base",
          })
          .select("id")
          .single()

        if (assetErr || !assetRow) {
          return NextResponse.json(
            { error: "failed to insert base creative_asset", detail: assetErr?.message },
            { status: 500 }
          )
        }
        baseSourceAssetId = assetRow.id
      }
    }

    const jobInserts = config.copyVariants.map((variant) => {
      let adName: string | null = null
      if (config.naming && variant.variant && variant.angle) {
        adName = buildAdName({
          testId: config.naming.testId,
          variant: variant.variant,
          angle: variant.angle,
          format: config.naming.format,
          cta: config.naming.cta,
        })
      }
      return {
        brief_id: brief.id,
        base_video_gcs_path: baseGcsPath,
        variant_slug: variant.slug,
        copy_text:
          (config.templateVersion ?? 1) >= 2
            ? formatPovVideoOverlay(variant.copy)
            : variant.copy,
        concept_slug: config.conceptSlug,
        template_version: config.templateVersion ?? 1,
        ad_name: adName,
      }
    })

    const { data: jobs, error: jobsErr } = await admin!
      .from("render_jobs")
      .insert(jobInserts)
      .select("id, variant_slug")

    if (jobsErr) {
      return NextResponse.json(
        { error: "failed to enqueue render jobs", detail: jobsErr.message },
        { status: 500 }
      )
    }

    await admin!.from("creative_briefs").update({ status: "generating" }).eq("id", brief.id)

    return NextResponse.json({
      success: true,
      baseAssetId: baseSourceAssetId,
      baseGcsPath,
      jobs: jobs ?? [],
    })
  } catch (err) {
    if (err instanceof InvalidAdNameError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : String(err)
    console.error("[agent/generate-video] failed", err)
    return NextResponse.json({ error: "orchestration failed", detail: message }, { status: 500 })
  }
}
