import { refreshCreativeAssetUrl, uploadRemoteToCreativeObject } from "@/lib/agent/gcs"
import { baseVideoPath } from "@/lib/agent/gcs-paths"
import { buildAdName } from "@/lib/agent/naming-builder"
import { generateVideo, isRunwayConfigured, pollTask } from "@/lib/agent/runway"
import type { VideoConfig } from "@/lib/agent/types"
import { DEFAULT_POV_SAUNA_TEMPLATE_VERSION, formatPovVideoOverlay } from "@/lib/agent/video-template-copy"
import { createAdminClient } from "@/lib/supabase/admin"

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

export function mergeRunwayEditPrompt(basePrompt: string, editPrompt: string): string {
  const base = basePrompt.trim()
  const edit = editPrompt.trim()
  if (!edit) return base
  if (!base) return edit
  return `${base}. ${edit}`
}

export function canEditRunwayVideoAsset(
  asset: {
    generation_tool?: string | null
    variation_label?: string | null
  },
  videoConfig: VideoConfig | null | undefined
): boolean {
  if (!videoConfig || videoConfig.source !== "runway") return false
  if (asset.generation_tool === "composite-video") return true
  if (asset.generation_tool === "runway" && asset.variation_label === "base") return true
  return false
}

export type EditRunwayVideoResult = {
  briefId: string
  baseAssetId: string
  baseGcsPath: string
  mergedPrompt: string
  jobsQueued: number
}

export async function editRunwayVideoFromAsset(opts: {
  assetId: string
  editPrompt: string
}): Promise<EditRunwayVideoResult> {
  const editPrompt = opts.editPrompt.trim()
  if (!editPrompt) throw new Error("edit_prompt is required")
  if (!isRunwayConfigured()) {
    throw new Error("Runway is not configured on this server")
  }

  const admin = createAdminClient()

  const { data: asset, error: assetError } = await admin
    .from("creative_assets")
    .select("id, brief_id, generation_tool, variation_label")
    .eq("id", opts.assetId)
    .maybeSingle()

  if (assetError) throw assetError
  if (!asset?.brief_id) throw new Error("Asset not found")

  const { data: brief, error: briefError } = await admin
    .from("creative_briefs")
    .select("id, status, video_config, trigger_data")
    .eq("id", asset.brief_id)
    .maybeSingle()

  if (briefError) throw briefError
  if (!brief?.video_config || !isVideoConfig(brief.video_config)) {
    throw new Error("Brief has no video_config")
  }

  const config = brief.video_config
  if (config.source !== "runway") {
    throw new Error("Inline video edits are only available for Runway-sourced briefs")
  }
  if (!canEditRunwayVideoAsset(asset, config)) {
    throw new Error("This asset cannot be edited inline")
  }
  if (!config.copyVariants.length) {
    throw new Error("video_config.copyVariants is empty")
  }

  const mergedPrompt = mergeRunwayEditPrompt(config.runwayPrompt ?? "", editPrompt)
  const templateVersion = config.templateVersion ?? DEFAULT_POV_SAUNA_TEMPLATE_VERSION
  const triggerData =
    brief.trigger_data && typeof brief.trigger_data === "object"
      ? (brief.trigger_data as Record<string, unknown>)
      : {}
  const pathCategory = typeof triggerData.category === "string" ? triggerData.category : "Hosts"
  const pathAngleSlug =
    typeof triggerData.angle === "string" ? triggerData.angle : config.conceptSlug.replace(/-/g, "_")

  const { taskId } = await generateVideo({
    prompt: mergedPrompt,
    duration: config.duration ?? 5,
    ratio: config.ratio ?? "768:1280",
  })

  const task = await pollTask(taskId, { intervalMs: 5_000, timeoutMs: 4 * 60_000 })
  if (task.status !== "SUCCEEDED" || !task.output?.[0]) {
    throw new Error(`Runway task ${task.status}: ${task.failure ?? task.failureCode ?? "no output"}`)
  }

  const baseGcsPath = baseVideoPath({
    date: new Date(),
    conceptSlug: config.conceptSlug,
    assetSlug: config.assetSlug,
    source: "runway",
    taskId,
    category: pathCategory,
    angleSlug: pathAngleSlug,
  })

  const uploaded = await uploadRemoteToCreativeObject(task.output[0], baseGcsPath)
  const signedBaseUrl = await refreshCreativeAssetUrl(uploaded.gcsPath)

  const { data: existingBase } = await admin
    .from("creative_assets")
    .select("id")
    .eq("brief_id", brief.id)
    .eq("generation_tool", "runway")
    .eq("variation_label", "base")
    .maybeSingle()

  let baseAssetId: string
  if (existingBase) {
    const { error: updateBaseError } = await admin
      .from("creative_assets")
      .update({
        gcs_path: uploaded.gcsPath,
        gcs_url: signedBaseUrl,
        status: "generated",
      })
      .eq("id", existingBase.id)
    if (updateBaseError) throw updateBaseError
    baseAssetId = existingBase.id
  } else {
    const { data: insertedBase, error: insertBaseError } = await admin
      .from("creative_assets")
      .insert({
        brief_id: brief.id,
        asset_type: "video",
        generation_tool: "runway",
        gcs_path: uploaded.gcsPath,
        gcs_url: signedBaseUrl,
        status: "generated",
        variation_label: "base",
      })
      .select("id")
      .single()
    if (insertBaseError || !insertedBase) {
      throw new Error(insertBaseError?.message ?? "Failed to insert base video asset")
    }
    baseAssetId = insertedBase.id
  }

  await admin
    .from("creative_assets")
    .delete()
    .eq("brief_id", brief.id)
    .eq("generation_tool", "composite-video")

  const nextConfig: VideoConfig = { ...config, runwayPrompt: mergedPrompt }
  const { error: briefUpdateError } = await admin
    .from("creative_briefs")
    .update({
      video_config: nextConfig,
      status: "generating",
    })
    .eq("id", brief.id)
  if (briefUpdateError) throw briefUpdateError

  const { data: existingJobs, error: jobsError } = await admin
    .from("render_jobs")
    .select("id, variant_slug")
    .eq("brief_id", brief.id)

  if (jobsError) throw jobsError

  let jobsQueued = 0

  if (existingJobs?.length) {
    const { error: resetError } = await admin
      .from("render_jobs")
      .update({
        status: "pending",
        base_video_gcs_path: baseGcsPath,
        worker_id: null,
        attempts: 0,
        rendered_gcs_path: null,
        rendered_asset_id: null,
        error_message: null,
        error_stack: null,
        completed_at: null,
        claimed_at: null,
      })
      .eq("brief_id", brief.id)
    if (resetError) throw resetError
    jobsQueued = existingJobs.length
  } else {
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
          templateVersion >= 2 ? formatPovVideoOverlay(variant.copy) : variant.copy,
        concept_slug: config.conceptSlug,
        template_version: templateVersion,
        ad_name: adName,
      }
    })

    const { data: insertedJobs, error: insertJobsError } = await admin
      .from("render_jobs")
      .insert(jobInserts)
      .select("id")

    if (insertJobsError) throw insertJobsError
    jobsQueued = insertedJobs?.length ?? jobInserts.length
  }

  return {
    briefId: brief.id,
    baseAssetId,
    baseGcsPath,
    mergedPrompt,
    jobsQueued,
  }
}
