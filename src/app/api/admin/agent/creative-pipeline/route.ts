import { NextRequest, NextResponse } from "next/server"

import { refreshCreativeAssetUrl } from "@/lib/agent/gcs"
import { requireAdminApi } from "@/lib/admin-guard"

const PIPELINE_ACTIONS = new Set(["reject_brief", "update_brief", "approve_asset", "reject_asset"])

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
] as const

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
  const select = "id, platform_id, adset_name, status, market, aud_type, goal_type"
  const metaRegistry = await admin.from("meta_adset_registry").select(select).order("created_at", { ascending: false })
  if (!metaRegistry.error) return metaRegistry

  return admin
    .from("adset_registry")
    .select(select)
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
    .in("status", ["approved", "generating"])
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
  const signedGeneratedAssets = await withSignedUrls((generatedAssets.data ?? []) as CreativeAssetRow[])
  const signedLaunchedAssets = await withSignedUrls((launchedAssets.data ?? []) as CreativeAssetRow[])
  const launchedWithInsights = await mergeMetaInsights(admin!, signedLaunchedAssets)

  return NextResponse.json({
    briefs: briefs.data ?? [],
    generatingBriefs: (approvedBriefs.data ?? []).filter((brief) => !assetBriefIds.has(brief.id)),
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
