import { NextRequest, NextResponse } from "next/server"

import { refreshCreativeAssetUrl, refreshCreativeObjectUrl } from "@/lib/agent/gcs"
import type { RenderJob, VideoConfig } from "@/lib/agent/types"
import { requireAdminApi } from "@/lib/admin-guard"

const PIPELINE_ACTIONS = new Set([
  "reject_brief",
  "update_brief",
  "approve_asset",
  "reject_asset",
  "create_video_brief",
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

async function fetchMetaAdsets(admin: AdminClient) {
  const metaRegistry = await admin
    .from("meta_adset_registry")
    .select("*")
    .order("created_at", { ascending: false })
  if (!metaRegistry.error) return metaRegistry

  return admin
    .from("adset_registry")
    .select("*")
    .eq("platform", "meta")
    .order("created_at", { ascending: false })
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

  const [briefs, generatedAssets, launchedAssets, adsets] = await Promise.all([
    admin!
      .from("creative_briefs")
      .select("*")
      .in("status", ["pending", "briefed"])
      .is("approved_at", null)
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
    fetchMetaAdsets(admin!),
  ])

  const firstError =
    briefs.error ?? generatedAssets.error ?? launchedAssets.error ?? adsets.error
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

  const activeMetaAdsets = (adsets.data ?? []).filter((adset) =>
    String(adset.status ?? "").toLowerCase() === "active"
  )

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
    if (allTerminal) {
      await admin!
        .from("creative_briefs")
        .update({ status: "variations_ready" })
        .eq("id", brief.id)
      brief.status = "variations_ready"
    }
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
    activeMetaAdsets,
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
    if (videoConfig.source === "runway" && !videoConfig.runwayPrompt?.trim()) {
      return NextResponse.json({ error: "runwayPrompt is required for Runway source" }, { status: 400 })
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
  return NextResponse.json({ asset: data })
}
