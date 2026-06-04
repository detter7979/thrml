import { NextRequest, NextResponse } from "next/server"

import { appendApprovedCreativeToNamer } from "@/lib/agent/namer-creative-append"
import { deleteCreativeBrief, purgeCreativePipeline } from "@/lib/agent/creative-pipeline-purge"
import { refreshCreativeAssetUrl, refreshCreativeObjectUrl } from "@/lib/agent/gcs"
import { isRunwayConfigured } from "@/lib/agent/runway"
import { processStaticBrief } from "@/lib/agent/static-generator"
import { editStaticPhotoAsset } from "@/lib/agent/static-photo-recomposite"
import { statusAfterStaticGeneration } from "@/lib/agent/creative-brief-status"
import { previewFormatForBrief } from "@/lib/agent/static-brief-plan"
import {
  expandStaticSizesFromAsset,
  generateStaticVariationPreview,
} from "@/lib/agent/static-preview-expand"
import { editRunwayVideoFromAsset } from "@/lib/agent/video-runway-edit"
import {
  generateFromSvgTemplate,
  loadSvgTemplateRegistry,
  type SvgAspectRatio,
} from "@/lib/agent/svg-template-generator"
import type { RenderJob, VideoConfig } from "@/lib/agent/types"
import {
  fetchLaunchableAdsets,
  fetchLaunchableCampaigns,
  getMetaAdAccountId,
} from "@/lib/agent/meta-ads-api"
import { requireAdminApi } from "@/lib/admin-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const PIPELINE_ACTIONS = new Set([
  "reject_brief",
  "delete_brief",
  "update_brief",
  "approve_asset",
  "reject_asset",
  "create_video_brief",
  "create_static_brief",
  "create_svg_static_brief",
  "generate_preview",
  "expand_static_sizes",
  "generate_variation_preview",
  "generate_svg_static",
  "acknowledge_claim_warning",
  "edit_static_photo",
  "edit_runway_video",
  "purge_creative_pipeline",
])

type AdminClient = NonNullable<Awaited<ReturnType<typeof requireAdminApi>>["admin"]>
type CreativeAssetRow = {
  id: string
  gcs_path?: string | null
  gcs_url?: string | null
  meta_ad_id?: string | null
  performance_data?: Record<string, unknown> | null
}
type InsightRow = {
  meta_ad_id?: string | null
  ad_id?: string | null
  spend?: number | string | null
  cpa?: number | string | null
  cost_per_action?: number | string | null
  cost_per_purchase?: number | string | null
  date_start?: string | null
  created_at?: string | null
}

const BRIEF_FIELDS = [
  "trigger_type",
  "trigger_data",
  "status",
  "hypothesis",
  "target_audience",
  "hook",
  "format",
  "visual_direction",
  "copy_primary",
  "copy_headline",
  "copy_subtext",
  "cta",
  "reference_image_urls",
  "rationale",
  "campaign_short_name",
  "success_criteria",
  "video_config",
] as const

type RenderJobRow = RenderJob & {
  brief_id: string
  base_video_gcs_path?: string
  concept_slug?: string
  template_version?: number
}

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

async function withSignedRenderJobs(jobs: RenderJobRow[]) {
  return Promise.all(
    jobs.map(async (job) => {
      if (!job.rendered_gcs_path) return job
      try {
        const signed_url = await refreshCreativeObjectUrl(job.rendered_gcs_path)
        return { ...job, signed_url }
      } catch {
        return job
      }
    })
  )
}

async function withSignedUrls<T extends CreativeAssetRow>(assets: T[]) {
  return Promise.all(
    assets.map(async (asset) => {
      if (!asset.gcs_path) return asset
      try {
        const signedUrl = await refreshCreativeAssetUrl(asset.gcs_path)
        return { ...asset, signed_url: signedUrl }
      } catch {
        return asset
      }
    })
  )
}

type LaunchableMetaCampaign = {
  platform_id: string
  campaign_name: string
  status: string | null
}

type LaunchableMetaAdset = {
  id: string
  platform_id: string
  platform_campaign_id: string
  campaign_name: string
  adset_name: string
  status: string | null
  market: string | null
  aud_type: string | null
  goal_type: string | null
}

type LaunchTargetsResult = {
  campaigns: LaunchableMetaCampaign[]
  adsets: LaunchableMetaAdset[]
  source: "meta" | "database"
}

async function fetchMetaAdsetsFromDb(admin: AdminClient): Promise<LaunchTargetsResult> {
  const { data, error } = await admin
    .from("ad_sets")
    .select(
      "id, name, status, platform_adset_id, audience_src, conv_event, campaign_id, campaigns(id, name, geo, platform, platform_campaign_id)"
    )
    .in("status", ["TEST", "SCALE"])
    .not("platform_adset_id", "is", null)
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)

  const campaignByPlatformId = new Map<string, LaunchableMetaCampaign>()
  const adsets: LaunchableMetaAdset[] = []

  for (const row of data ?? []) {
    const camp = Array.isArray(row.campaigns) ? row.campaigns[0] : row.campaigns
    if (camp?.platform !== "META" || !camp.platform_campaign_id) continue

    const platformCampaignId = camp.platform_campaign_id as string
    if (!campaignByPlatformId.has(platformCampaignId)) {
      campaignByPlatformId.set(platformCampaignId, {
        platform_id: platformCampaignId,
        campaign_name: (camp.name as string) ?? platformCampaignId,
        status: null,
      })
    }

    adsets.push({
      id: row.id,
      platform_id: row.platform_adset_id ?? row.id,
      platform_campaign_id: platformCampaignId,
      campaign_name: (camp.name as string) ?? platformCampaignId,
      adset_name: row.name,
      status: row.status,
      market: camp.geo ?? null,
      aud_type: row.audience_src ?? null,
      goal_type: row.conv_event ?? null,
    })
  }

  const campaigns = [...campaignByPlatformId.values()].sort((a, b) =>
    a.campaign_name.localeCompare(b.campaign_name)
  )

  return {
    campaigns,
    adsets: adsets.sort((a, b) => a.adset_name.localeCompare(b.adset_name)),
    source: "database",
  }
}

async function fetchMetaLaunchTargets(admin: AdminClient): Promise<LaunchTargetsResult> {
  try {
    const accountId = getMetaAdAccountId()
    const [campaigns, adsets] = await Promise.all([
      fetchLaunchableCampaigns(accountId),
      fetchLaunchableAdsets(accountId),
    ])

    if (campaigns.length === 0 && adsets.length === 0) {
      return fetchMetaAdsetsFromDb(admin)
    }

    const campaignNameById = new Map(campaigns.map((c) => [c.id, c.name]))
    const launchCampaigns: LaunchableMetaCampaign[] = campaigns.map((c) => ({
      platform_id: c.id,
      campaign_name: c.name,
      status: c.effective_status ?? c.status ?? null,
    }))
    const campaignIds = new Set(launchCampaigns.map((c) => c.platform_id))

    const launchAdsets: LaunchableMetaAdset[] = adsets.map((a) => ({
      id: a.id,
      platform_id: a.id,
      platform_campaign_id: a.campaign_id,
      campaign_name: campaignNameById.get(a.campaign_id) ?? a.campaign_id,
      adset_name: a.name,
      status: a.effective_status ?? a.status ?? null,
      market: null,
      aud_type: null,
      goal_type: null,
    }))

    for (const adset of launchAdsets) {
      if (campaignIds.has(adset.platform_campaign_id)) continue
      campaignIds.add(adset.platform_campaign_id)
      launchCampaigns.push({
        platform_id: adset.platform_campaign_id,
        campaign_name: adset.campaign_name,
        status: null,
      })
    }

    launchCampaigns.sort((a, b) => a.campaign_name.localeCompare(b.campaign_name))

    return {
      campaigns: launchCampaigns,
      adsets: launchAdsets,
      source: "meta",
    }
  } catch (err) {
    console.error("[creative-pipeline] live Meta launch targets failed, using DB fallback:", err)
    return fetchMetaAdsetsFromDb(admin)
  }
}

function numberMetric(value: unknown) {
  if (typeof value === "number") return value
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value)
  return null
}

async function mergeMetaInsights<T extends CreativeAssetRow>(admin: AdminClient, assets: T[]) {
  const ids = assets.map((asset) => asset.meta_ad_id).filter((id): id is string => Boolean(id))
  if (ids.length === 0) return assets

  const { data, error } = await admin
    .from("meta_insights")
    .select("meta_ad_id, ad_id, spend, cpa, cost_per_action, cost_per_purchase, date_start, created_at")
    .or(`meta_ad_id.in.(${ids.join(",")}),ad_id.in.(${ids.join(",")})`)

  if (error) return assets

  const latestByAdId = new Map<string, InsightRow>()
  for (const row of (data ?? []) as InsightRow[]) {
    const adId = row.meta_ad_id ?? row.ad_id
    if (!adId) continue
    const previous = latestByAdId.get(adId)
    const rowDate = Date.parse(row.date_start ?? row.created_at ?? "")
    const previousDate = Date.parse(previous?.date_start ?? previous?.created_at ?? "")
    if (!previous || rowDate >= previousDate) latestByAdId.set(adId, row)
  }

  return assets.map((asset) => {
    const insight = asset.meta_ad_id ? latestByAdId.get(asset.meta_ad_id) : null
    if (!insight) return asset
    return {
      ...asset,
      performance_data: {
        ...(asset.performance_data ?? {}),
        spend: numberMetric(insight.spend),
        cpa: numberMetric(insight.cpa ?? insight.cost_per_action ?? insight.cost_per_purchase),
        insight_date: insight.date_start ?? insight.created_at ?? null,
      },
    }
  })
}

export async function GET() {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const [briefs, generatedAssets, launchedAssets, launchTargets] = await Promise.all([
    admin!
      .from("creative_briefs")
      .select("*")
      .is("approved_at", null)
      .in("status", ["pending", "briefed", "generating", "variations_ready"])
      .order("created_at", { ascending: false }),
    admin!
      .from("creative_assets")
      .select("*, creative_briefs(*)")
      .in("status", ["generated", "approved"])
      .order("created_at", { ascending: false })
      .limit(200),
    admin!
      .from("creative_assets")
      .select("*, creative_briefs(*)")
      .eq("status", "launched")
      .order("launched_at", { ascending: false })
      .limit(100),
    fetchMetaLaunchTargets(admin!),
  ])

  const firstError = briefs.error ?? generatedAssets.error ?? launchedAssets.error
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 })

  const approvedBriefs = await admin!
    .from("creative_briefs")
    .select("*")
    .in("status", ["approved", "generating", "variations_ready"])
    .not("approved_at", "is", null)
    .order("approved_at", { ascending: false })
    .limit(50)

  if (approvedBriefs.error) return NextResponse.json({ error: approvedBriefs.error.message }, { status: 500 })

  const approvedBriefIds = (approvedBriefs.data ?? []).map((brief) => brief.id).filter(Boolean)
  const assetBriefIds = new Set<string>()
  if (approvedBriefIds.length > 0) {
    const assetLinks = await admin!
      .from("creative_assets")
      .select("brief_id")
      .in("brief_id", approvedBriefIds)

    if (assetLinks.error) return NextResponse.json({ error: assetLinks.error.message }, { status: 500 })
    for (const asset of assetLinks.data ?? []) {
      if (asset.brief_id) assetBriefIds.add(asset.brief_id)
    }
  }

  const activeMetaCampaigns = launchTargets.campaigns
  const activeMetaAdsets = launchTargets.adsets

  const allBriefIds = [
    ...(briefs.data ?? []).map((b) => b.id),
    ...(approvedBriefs.data ?? []).map((b) => b.id),
  ].filter(Boolean)

  let renderJobsByBrief: Record<string, RenderJob[]> = {}
  if (allBriefIds.length > 0) {
    const { data: jobs, error: jobsError } = await admin!
      .from("render_jobs")
      .select(
        "id, brief_id, variant_slug, copy_text, status, attempts, max_attempts, error_message, rendered_gcs_path, rendered_asset_id, duration_ms, created_at, completed_at"
      )
      .in("brief_id", allBriefIds)
      .order("created_at", { ascending: true })

    if (jobsError) return NextResponse.json({ error: jobsError.message }, { status: 500 })

    const signedJobs = await withSignedRenderJobs((jobs ?? []) as RenderJobRow[])
    renderJobsByBrief = signedJobs.reduce<Record<string, RenderJob[]>>((acc, job) => {
      const list = acc[job.brief_id] ?? []
      list.push(job)
      acc[job.brief_id] = list
      return acc
    }, {})
  }

  for (const brief of approvedBriefs.data ?? []) {
    if (brief.status !== "generating" || !isVideoConfig(brief.video_config)) continue
    const jobs = renderJobsByBrief[brief.id] ?? []
    if (jobs.length === 0) continue
    const allTerminal = jobs.every(
      (job) =>
        job.status === "completed" ||
        job.status === "failed" ||
        job.status === "cancelled"
    )
    if (!allTerminal) continue

    const hasCompleted = jobs.some((job) => job.status === "completed")
    const nextStatus = hasCompleted ? "variations_ready" : "approved"
    if (brief.status !== nextStatus) {
      await admin!.from("creative_briefs").update({ status: nextStatus }).eq("id", brief.id)
    }
    brief.status = nextStatus
  }

  const approvedVideoBriefs = (approvedBriefs.data ?? []).filter(
    (brief) => isVideoConfig(brief.video_config) && brief.status === "approved"
  )

  const staticGeneratingBriefs = (approvedBriefs.data ?? []).filter(
    (brief) => !isVideoConfig(brief.video_config) && !assetBriefIds.has(brief.id)
  )

  const videoGeneratingBriefs = (approvedBriefs.data ?? []).filter((brief) => {
    if (!isVideoConfig(brief.video_config)) return false
    if (brief.status === "generating") return true
    const jobs = renderJobsByBrief[brief.id] ?? []
    return jobs.some((job) => job.status === "pending" || job.status === "running")
  })

  const signedGeneratedAssets = await withSignedUrls((generatedAssets.data ?? []) as CreativeAssetRow[])
  const signedLaunchedAssets = await withSignedUrls((launchedAssets.data ?? []) as CreativeAssetRow[])
  const launchedWithInsights = await mergeMetaInsights(admin!, signedLaunchedAssets)

  return NextResponse.json({
    briefs: briefs.data ?? [],
    generatingBriefs: staticGeneratingBriefs,
    approvedVideoBriefs,
    videoGeneratingBriefs,
    renderJobsByBrief,
    generatedAssets: signedGeneratedAssets,
    launchedAssets: launchedWithInsights,
    activeMetaCampaigns,
    activeMetaAdsets,
    metaLaunchSource: launchTargets.source,
    runwayConfigured: isRunwayConfigured(),
  })
}

export async function PATCH(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as {
    action?: string
    brief_id?: string
    asset_id?: string
    brief?: Record<string, unknown>
    edit_prompt?: string
    save_as_new_variant?: boolean
    replace_in_place?: boolean
    confirm?: string
    formats?: string[]
    variation_label?: string
    visual_direction?: string
  } | null

  if (!body?.action || !PIPELINE_ACTIONS.has(body.action)) {
    return NextResponse.json({ error: "Invalid pipeline action" }, { status: 400 })
  }

  if (body.action === "create_video_brief") {
    const videoConfig = body.brief?.video_config
    if (!isVideoConfig(videoConfig)) {
      return NextResponse.json({ error: "brief.video_config is required" }, { status: 400 })
    }
    if (!videoConfig.copyVariants.length) {
      return NextResponse.json({ error: "At least one copy variant is required" }, { status: 400 })
    }
    if (videoConfig.source === "runway") {
      return NextResponse.json(
        {
          error:
            "Runway-sourced briefs are no longer supported. Create video in Runway, upload MP4, and use template T2.",
        },
        { status: 400 },
      )
    }
    if (videoConfig.source === "uploaded" && !videoConfig.uploadedGcsPath?.trim()) {
      return NextResponse.json({ error: "uploadedGcsPath is required for uploaded source" }, { status: 400 })
    }

    const saveAndApprove = Boolean(body.brief?.saveAndApprove)
    const now = new Date().toISOString()
    const hook =
      typeof body.brief?.hook === "string" && body.brief.hook.trim()
        ? body.brief.hook.trim()
        : videoConfig.copyVariants[0]?.copy ?? videoConfig.conceptSlug

    const { data, error: insertError } = await admin!
      .from("creative_briefs")
      .insert({
        trigger_type: "manual",
        status: saveAndApprove ? "approved" : "briefed",
        format: "9x16",
        hook,
        hypothesis:
          typeof body.brief?.hypothesis === "string" ? body.brief.hypothesis : null,
        campaign_short_name: videoConfig.conceptSlug,
        video_config: videoConfig,
        approved_at: saveAndApprove ? now : null,
        created_by: "admin",
      })
      .select("*")
      .maybeSingle()

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
    return NextResponse.json({ brief: data })
  }

  if (body.action === "create_static_brief") {
    const b = body.brief ?? {}
    const triggerData =
      b.trigger_data && typeof b.trigger_data === "object" && !Array.isArray(b.trigger_data)
        ? (b.trigger_data as Record<string, unknown>)
        : {}
    const visualDirection =
      typeof b.visual_direction === "string" ? b.visual_direction.trim() : ""
    const usesSvg = typeof triggerData.svg_template_id === "string"
    if (
      !visualDirection &&
      !Array.isArray(triggerData.static_variations) &&
      !usesSvg
    ) {
      return NextResponse.json({ error: "visual_direction, static_variations, or svg_template_id required" }, { status: 400 })
    }

    const saveAndApprove = Boolean(b.saveAndApprove)
    const now = new Date().toISOString()

    const { data, error: insertError } = await admin!
      .from("creative_briefs")
      .insert({
        trigger_type: typeof b.trigger_type === "string" ? b.trigger_type : "manual",
        trigger_data: triggerData,
        status: saveAndApprove ? "approved" : "briefed",
        hypothesis: typeof b.hypothesis === "string" ? b.hypothesis : null,
        target_audience: typeof b.target_audience === "string" ? b.target_audience : null,
        hook: typeof b.hook === "string" ? b.hook : null,
        format: typeof b.format === "string" ? b.format : "1x1,9x16",
        visual_direction: visualDirection || null,
        copy_primary: typeof b.copy_primary === "string" ? b.copy_primary : null,
        copy_headline: typeof b.copy_headline === "string" ? b.copy_headline : null,
        copy_subtext: typeof b.copy_subtext === "string" ? b.copy_subtext : null,
        cta: typeof b.cta === "string" ? b.cta : null,
        campaign_short_name: typeof b.campaign_short_name === "string" ? b.campaign_short_name : null,
        success_criteria:
          b.success_criteria && typeof b.success_criteria === "object" ? b.success_criteria : { variations: 1 },
        approved_at: saveAndApprove ? now : null,
        created_by: "admin",
      })
      .select("*")
      .maybeSingle()

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: "Failed to create brief" }, { status: 500 })

    if (saveAndApprove) {
      try {
        const generated = await processStaticBrief({ briefId: data.id })
        const { data: updated, error: reloadError } = await admin!
          .from("creative_briefs")
          .select("*")
          .eq("id", data.id)
          .maybeSingle()

        if (reloadError) return NextResponse.json({ error: reloadError.message }, { status: 500 })
        return NextResponse.json({ brief: updated ?? data, generated })
      } catch (err) {
        const message = err instanceof Error ? err.message : "Static generation failed"
        console.error("[creative-pipeline] create_static_brief generation failed", err)

        await admin!
          .from("creative_briefs")
          .update({ status: "briefed", approved_at: null })
          .eq("id", data.id)

        return NextResponse.json({ error: message, brief: data }, { status: 500 })
      }
    }

    return NextResponse.json({ brief: data })
  }

  if (body.action === "create_svg_static_brief") {
    const b = body.brief ?? {}
    const templateId = typeof b.svg_template_id === "string" ? b.svg_template_id.trim() : ""
    const aspectRatio = typeof b.aspect_ratio === "string" ? b.aspect_ratio.trim() : "1:1"
    const tokens =
      b.tokens && typeof b.tokens === "object" && !Array.isArray(b.tokens)
        ? (b.tokens as Record<string, string>)
        : null

    if (!templateId) {
      return NextResponse.json({ error: "svg_template_id is required" }, { status: 400 })
    }
    if (!tokens || !Object.keys(tokens).length) {
      return NextResponse.json({ error: "tokens object is required" }, { status: 400 })
    }

    const registry = loadSvgTemplateRegistry()
    const template = registry.find((entry) => entry.id === templateId)
    if (!template) {
      return NextResponse.json({ error: `Unknown SVG template: ${templateId}` }, { status: 400 })
    }

    const formatToken =
      aspectRatio === "4:5" ? "4x5" : aspectRatio === "9:16" ? "9x16" : "1x1"
    if (!template.aspect_ratios.includes(formatToken as "1x1" | "4x5" | "9x16")) {
      return NextResponse.json({ error: `Template does not support aspect ratio ${aspectRatio}` }, { status: 400 })
    }

    const saveAndApprove = Boolean(b.saveAndApprove)
    const generatePreview = b.generate_preview !== false
    const now = new Date().toISOString()
    const photoGcsPath = typeof b.photo_gcs_path === "string" ? b.photo_gcs_path.trim() : null

    const triggerData: Record<string, unknown> = {
      category: typeof b.category === "string" ? b.category : "Hosts",
      angle: typeof b.angle === "string" ? b.angle : "pov_earnings",
      generation_tool: "svg_template",
      svg_template_id: templateId,
      svg_tokens: tokens,
      photo_gcs_path: photoGcsPath,
      concept_verify: Boolean(b.concept_verify ?? true),
      variations: 1,
      naming:
        b.naming && typeof b.naming === "object" && !Array.isArray(b.naming)
          ? b.naming
          : { test_id: "T05", format: `Static_${formatToken}`, cta: "list_now" },
    }

    const { data: brief, error: insertError } = await admin!
      .from("creative_briefs")
      .insert({
        trigger_type: "manual",
        trigger_data: triggerData,
        status: saveAndApprove ? "approved" : "briefed",
        hypothesis: typeof b.hypothesis === "string" ? b.hypothesis : null,
        hook: typeof b.hook === "string" ? b.hook : null,
        format: formatToken,
        campaign_short_name: typeof b.campaign_short_name === "string" ? b.campaign_short_name : "pov-earnings",
        success_criteria: {
          variations: 1,
          concept_verify: Boolean(b.concept_verify ?? true),
          formats: [formatToken],
        },
        approved_at: saveAndApprove ? now : null,
        created_by: "admin",
      })
      .select("*")
      .maybeSingle()

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
    if (!brief) return NextResponse.json({ error: "Failed to create brief" }, { status: 500 })

    if (!generatePreview) {
      return NextResponse.json({ brief })
    }

    try {
      const asset = await generateFromSvgTemplate(
        brief.id,
        templateId,
        aspectRatio as SvgAspectRatio,
        tokens,
        photoGcsPath,
      )
      const nextStatus = statusAfterStaticGeneration(brief.approved_at)
      await admin!.from("creative_briefs").update({ status: nextStatus }).eq("id", brief.id)
      return NextResponse.json({ brief: { ...brief, status: nextStatus }, asset })
    } catch (err) {
      const message = err instanceof Error ? err.message : "SVG generation failed"
      return NextResponse.json({ error: message, brief }, { status: 500 })
    }
  }

  if (body.action === "generate_svg_static") {
    if (!body.brief_id) return NextResponse.json({ error: "brief_id is required" }, { status: 400 })
    const b = body.brief ?? {}
    const templateId =
      typeof b.svg_template_id === "string"
        ? b.svg_template_id.trim()
        : undefined
    const aspectRatio = (typeof b.aspect_ratio === "string" ? b.aspect_ratio.trim() : "1:1") as SvgAspectRatio
    const tokens =
      b.tokens && typeof b.tokens === "object" && !Array.isArray(b.tokens)
        ? (b.tokens as Record<string, string>)
        : undefined
    const photoGcsPath = typeof b.photo_gcs_path === "string" ? b.photo_gcs_path.trim() : undefined

    const { data: brief, error: briefError } = await admin!
      .from("creative_briefs")
      .select("id, trigger_data, approved_at")
      .eq("id", body.brief_id)
      .maybeSingle()

    if (briefError) return NextResponse.json({ error: briefError.message }, { status: 500 })
    if (!brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 })

    const td = (brief.trigger_data as Record<string, unknown> | null) ?? {}
    const resolvedTemplateId =
      templateId ?? (typeof td.svg_template_id === "string" ? td.svg_template_id : "")
    const resolvedTokens =
      tokens ??
      (td.svg_tokens && typeof td.svg_tokens === "object" && !Array.isArray(td.svg_tokens)
        ? (td.svg_tokens as Record<string, string>)
        : {})
    const resolvedPhoto =
      photoGcsPath ?? (typeof td.photo_gcs_path === "string" ? td.photo_gcs_path : undefined)

    if (!resolvedTemplateId) {
      return NextResponse.json({ error: "svg_template_id is required" }, { status: 400 })
    }

    try {
      const asset = await generateFromSvgTemplate(
        brief.id,
        resolvedTemplateId,
        aspectRatio,
        resolvedTokens,
        resolvedPhoto,
      )
      const nextStatus = statusAfterStaticGeneration(brief.approved_at)
      await admin!.from("creative_briefs").update({ status: nextStatus }).eq("id", brief.id)
      return NextResponse.json({ ok: true, asset })
    } catch (err) {
      const message = err instanceof Error ? err.message : "SVG generation failed"
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  if (body.action === "acknowledge_claim_warning") {
    if (!body.brief_id) return NextResponse.json({ error: "brief_id is required" }, { status: 400 })
    const { data: brief, error: briefError } = await admin!
      .from("creative_briefs")
      .select("trigger_data")
      .eq("id", body.brief_id)
      .maybeSingle()

    if (briefError) return NextResponse.json({ error: briefError.message }, { status: 500 })
    if (!brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 })

    const td = (brief.trigger_data as Record<string, unknown> | null) ?? {}
    const claimWarning =
      td.claim_warning && typeof td.claim_warning === "object" && !Array.isArray(td.claim_warning)
        ? (td.claim_warning as Record<string, unknown>)
        : null

    if (!claimWarning) {
      return NextResponse.json({ error: "Brief has no claim warning" }, { status: 400 })
    }

    const { data, error: updateError } = await admin!
      .from("creative_briefs")
      .update({
        trigger_data: {
          ...td,
          claim_warning: {
            ...claimWarning,
            acknowledged_at: new Date().toISOString(),
            acknowledged_by: "admin",
          },
        },
      })
      .eq("id", body.brief_id)
      .select("*")
      .maybeSingle()

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    return NextResponse.json({ brief: data })
  }

  if (body.action === "generate_preview") {
    if (!body.brief_id) return NextResponse.json({ error: "brief_id is required" }, { status: 400 })

    const { data: brief, error: briefError } = await admin!
      .from("creative_briefs")
      .select("id, trigger_data, format, success_criteria")
      .eq("id", body.brief_id)
      .maybeSingle()

    if (briefError) return NextResponse.json({ error: briefError.message }, { status: 500 })
    if (!brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 })

    try {
      const previewFormat = previewFormatForBrief(brief)
      const generated = await processStaticBrief({
        briefId: body.brief_id,
        variations: 1,
        formats: [previewFormat],
      })
      return NextResponse.json({ ok: true, generated, preview_format: previewFormat })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Preview generation failed"
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  if (body.action === "expand_static_sizes") {
    if (!body.asset_id) return NextResponse.json({ error: "asset_id is required" }, { status: 400 })

    try {
      const result = await expandStaticSizesFromAsset({
        assetId: body.asset_id,
        formats: Array.isArray(body.formats)
          ? body.formats.filter((value): value is "1x1" | "4x5" | "9x16" =>
              value === "1x1" || value === "4x5" || value === "9x16",
            )
          : undefined,
      })
      return NextResponse.json({ ok: true, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Size expansion failed"
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  if (body.action === "generate_variation_preview") {
    if (!body.brief_id) return NextResponse.json({ error: "brief_id is required" }, { status: 400 })
    const variationLabel = typeof body.variation_label === "string" ? body.variation_label.trim().toUpperCase() : ""
    if (variationLabel !== "A" && variationLabel !== "B" && variationLabel !== "C") {
      return NextResponse.json({ error: "variation_label must be A, B, or C" }, { status: 400 })
    }

    try {
      const result = await generateStaticVariationPreview({
        briefId: body.brief_id,
        variationLabel,
        promptOverride: typeof body.visual_direction === "string" ? body.visual_direction : null,
      })
      return NextResponse.json({ ok: true, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Variation preview failed"
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  if (body.action === "edit_static_photo") {
    if (!body.asset_id) return NextResponse.json({ error: "asset_id is required" }, { status: 400 })
    const editPrompt = typeof body.edit_prompt === "string" ? body.edit_prompt.trim() : ""
    if (!editPrompt) return NextResponse.json({ error: "edit_prompt is required" }, { status: 400 })

    try {
      const result = await editStaticPhotoAsset({
        assetId: body.asset_id,
        editPrompt,
        saveAsNewVariant: Boolean(body.save_as_new_variant),
        replaceInPlace: body.replace_in_place !== false && !body.save_as_new_variant,
      })
      return NextResponse.json({ ok: true, result })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Photo edit failed"
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  if (body.action === "edit_runway_video") {
    if (!body.asset_id) return NextResponse.json({ error: "asset_id is required" }, { status: 400 })
    const editPrompt = typeof body.edit_prompt === "string" ? body.edit_prompt.trim() : ""
    if (!editPrompt) return NextResponse.json({ error: "edit_prompt is required" }, { status: 400 })

    try {
      const result = await editRunwayVideoFromAsset({
        assetId: body.asset_id,
        editPrompt,
      })
      return NextResponse.json({ ok: true, result })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Video edit failed"
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  if (body.action === "purge_creative_pipeline") {
    const confirm = typeof body.confirm === "string" ? body.confirm.trim() : ""
    if (confirm !== "DELETE_ALL_CREATIVES") {
      return NextResponse.json(
        { error: 'Type confirm: "DELETE_ALL_CREATIVES" to purge all briefs and generated files.' },
        { status: 400 }
      )
    }

    try {
      const summary = await purgeCreativePipeline()
      return NextResponse.json({ ok: true, summary })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Creative purge failed"
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  if (body.action === "reject_brief") {
    if (!body.brief_id) return NextResponse.json({ error: "brief_id is required" }, { status: 400 })
    const { data, error: updateError } = await admin!
      .from("creative_briefs")
      .update({ status: "rejected", rejected_at: new Date().toISOString() })
      .eq("id", body.brief_id)
      .select("*")
      .maybeSingle()

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    return NextResponse.json({ brief: data })
  }

  if (body.action === "delete_brief") {
    if (!body.brief_id) return NextResponse.json({ error: "brief_id is required" }, { status: 400 })

    try {
      const summary = await deleteCreativeBrief(body.brief_id)
      return NextResponse.json({ ok: true, summary })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Brief delete failed"
      const status = message === "Brief not found" ? 404 : 500
      return NextResponse.json({ error: message }, { status })
    }
  }

  if (body.action === "update_brief") {
    if (!body.brief_id) return NextResponse.json({ error: "brief_id is required" }, { status: 400 })
    const updates: Record<string, unknown> = {}
    for (const field of BRIEF_FIELDS) {
      if (body.brief && Object.hasOwn(body.brief, field)) updates[field] = body.brief[field]
    }

    const { data, error: updateError } = await admin!
      .from("creative_briefs")
      .update(updates)
      .eq("id", body.brief_id)
      .select("*")
      .maybeSingle()

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    return NextResponse.json({ brief: data })
  }

  if (!body.asset_id) return NextResponse.json({ error: "asset_id is required" }, { status: 400 })

  const update =
    body.action === "approve_asset"
      ? { status: "approved", approved_at: new Date().toISOString() }
      : { status: "rejected", approved_at: null }

  const { data, error: updateError } = await admin!
    .from("creative_assets")
    .update(update)
    .eq("id", body.asset_id)
    .select("*")
    .maybeSingle()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  let namer_sync: Awaited<ReturnType<typeof appendApprovedCreativeToNamer>> | undefined
  if (body.action === "approve_asset" && data) {
    try {
      namer_sync = await appendApprovedCreativeToNamer(admin!, data.id)
      if (!namer_sync.ok) {
        console.error("[creative-pipeline] namer append failed:", namer_sync.reason)
      }
    } catch (err) {
      console.error("[creative-pipeline] namer append error:", err)
      namer_sync = {
        ok: false,
        reason: err instanceof Error ? err.message : "Unknown namer sync error",
      }
    }
  }

  return NextResponse.json({ asset: data, ...(namer_sync ? { namer_sync } : {}) })
}
