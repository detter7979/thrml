import { NextRequest, NextResponse } from "next/server"

import { downloadCreativeAsset, getSignedGcsReadUrl } from "@/lib/agent/gcs"
import { hasResolvableLaunchCopy, resolveBriefCopyForMeta } from "@/lib/agent/brief-copy-for-meta"
import { ctaToMetaEnumFromBrief } from "@/lib/agent/meta-cta"
import {
  canLaunchAsPlacementBundle,
  validatePlacementBundle,
  type LaunchableAssetRow,
} from "@/lib/agent/launch-creative-bundle"
import {
  collectLaunchPreflightWarnings,
  resolveLaunchLandingUrl,
  truncateForMetaLinkDescription,
} from "@/lib/agent/launch-creative-preflight"
import {
  buildPlacementAssetFeedSpec,
  resolvePlacementBundleAdName,
  type PlacementImageInput,
} from "@/lib/agent/meta-placement-creative"
import { normalizeStaticFormat } from "@/lib/agent/static-brief-plan"
import {
  getMetaAdAccountId,
  getMetaInstagramUserId,
  getMetaMarketingApiToken,
  getMetaPageId,
} from "@/lib/agent/meta-api"
import { uploadVideo } from "@/lib/agent/meta-video-upload"
import { requireAdminApi } from "@/lib/admin-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const META_GRAPH_BASE = "https://graph.facebook.com/v21.0"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type LaunchStatus = "PAUSED" | "ACTIVE"
const LAUNCH_STATUSES = new Set<LaunchStatus>(["PAUSED", "ACTIVE"])

const VIDEO_LAUNCH_TOOLS = new Set(["composite-video"])
const BASE_VIDEO_TOOLS = new Set(["runway", "manual"])

type LaunchCreativeBody = {
  assetId?: unknown
  assetIds?: unknown
  adsetId?: unknown
  status?: unknown
}

type CreativeBrief = {
  id: string
  copy_primary: string | null
  copy_headline: string | null
  copy_subtext: string | null
  cta: string | null
  hook: string | null
  campaign_short_name: string | null
  trigger_data?: Record<string, unknown> | null
}

type CreativeAssetRow = LaunchableAssetRow & {
  variation_index: number | null
  gcs_path: string | null
  convention_name: string | null
  performance_data?: Record<string, unknown> | null
  creative_briefs: CreativeBrief | CreativeBrief[] | null
}

type MetaIdResponse = {
  id?: string
}

type MetaAdImageUploadResponse = {
  images?: Record<string, { hash?: string }>
  hash?: string
}

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not set`)
  return value
}

function metaUrl(path: string, token: string) {
  const url = new URL(`${META_GRAPH_BASE}/${path.replace(/^\//, "")}`)
  url.searchParams.set("access_token", token)
  return url
}

function normalizeAdAccountId(adAccountId: string) {
  return adAccountId.replace(/^act_/, "")
}

function adsManagerUrl(adAccountId: string, adId: string) {
  const url = new URL("https://adsmanager.facebook.com/adsmanager/manage/ads")
  url.searchParams.set("act", normalizeAdAccountId(adAccountId))
  url.searchParams.set("selected_ad_ids", adId)
  return url.toString()
}

async function readMetaError(res: Response) {
  const text = await res.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function formatMetaActionError(action: string, payload: unknown): string {
  const base = `${action} failed: ${JSON.stringify(payload)}`
  const err =
    payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { code?: number; error_subcode?: number; message?: string } }).error
      : null
  if (err?.code === 100 && err.error_subcode === 33) {
    return (
      `${base} — Check META_AD_ACCOUNT_ID (use act_<id> or digits only), ` +
      "META_MARKETING_API_TOKEN ads_management access for that account, and that the token is not a Page token."
    )
  }
  if (err?.code === 100 && err.error_subcode === 1885183) {
    return (
      `${base} — Your Meta app is in Development mode. In developers.facebook.com open the app ` +
      "used for META_MARKETING_API_TOKEN, switch App mode to Live, complete required permissions " +
      "(ads_management), then regenerate the system user token in Business Settings if needed."
    )
  }
  return base
}

async function assertMetaOk(res: Response, action: string) {
  if (res.ok) return
  throw new Error(formatMetaActionError(action, await readMetaError(res)))
}

function firstBrief(asset: CreativeAssetRow) {
  return Array.isArray(asset.creative_briefs) ? asset.creative_briefs[0] ?? null : asset.creative_briefs
}

function briefForMetaLaunch(brief: CreativeBrief): CreativeBrief {
  const resolved = resolveBriefCopyForMeta(brief)
  return {
    ...brief,
    copy_primary: resolved.copy_primary,
    copy_headline: resolved.copy_headline,
    copy_subtext: resolved.copy_subtext,
    cta: resolved.cta,
  }
}

function resolvedLaunchCopyStrings(brief: CreativeBrief) {
  const copy = resolveBriefCopyForMeta(brief)
  return {
    primaryCopy: copy.copy_primary,
    headline: copy.copy_headline,
    subtext: copy.copy_subtext,
    cta: copy.cta,
  }
}

async function persistResolvedBriefCopyIfEmpty(
  admin: NonNullable<Awaited<ReturnType<typeof requireAdminApi>>["admin"]>,
  briefId: string,
  brief: CreativeBrief
) {
  const resolved = resolveBriefCopyForMeta(brief)
  const updates: Record<string, string> = {}
  if (!brief.copy_primary?.trim()) updates.copy_primary = resolved.copy_primary
  if (!brief.copy_headline?.trim()) updates.copy_headline = resolved.copy_headline
  if (!brief.copy_subtext?.trim()) updates.copy_subtext = resolved.copy_subtext
  if (!brief.cta?.trim()) updates.cta = resolved.cta
  if (Object.keys(updates).length === 0) return
  const { error } = await admin.from("creative_briefs").update(updates).eq("id", briefId)
  if (error) throw error
}

function extractImageHash(json: MetaAdImageUploadResponse) {
  if (json.hash) return json.hash
  const firstImage = Object.values(json.images ?? {})[0]
  return firstImage?.hash ?? null
}

function legacyAdName(asset: CreativeAssetRow, brief: CreativeBrief) {
  const campaign = brief.campaign_short_name?.trim() || "creative"
  const variation = asset.variation_label?.trim() || `variation-${asset.variation_index ?? 1}`
  return `${campaign}_${variation}_${asset.id.slice(0, 8)}`
}

function resolveAdName(asset: CreativeAssetRow, brief: CreativeBrief) {
  return asset.convention_name?.trim() || legacyAdName(asset, brief)
}

async function uploadImageToMeta(params: {
  token: string
  adAccountId: string
  assetId: string
  filename: string
  contentType: string
  buffer: Buffer
}) {
  const formData = new FormData()
  formData.set(
    "filename",
    new Blob([new Uint8Array(params.buffer)], { type: params.contentType }),
    params.filename
  )

  const res = await fetch(metaUrl(`${params.adAccountId}/adimages`, params.token), {
    method: "POST",
    body: formData,
  })
  await assertMetaOk(res, "Meta image upload")

  const json = (await res.json()) as MetaAdImageUploadResponse
  const imageHash = extractImageHash(json)
  if (!imageHash) throw new Error("Meta image upload response did not include an image hash")

  console.log("[launch-creative] uploaded image", {
    assetId: params.assetId,
    filename: params.filename,
    imageHash,
  })
  return imageHash
}

async function createMetaPlacementCreative(params: {
  token: string
  adAccountId: string
  pageId: string
  instagramUserId?: string | null
  name: string
  assetFeedSpec: ReturnType<typeof buildPlacementAssetFeedSpec>
}) {
  const objectStorySpec: Record<string, string> = { page_id: params.pageId }
  if (params.instagramUserId) {
    objectStorySpec.instagram_user_id = params.instagramUserId
  }

  const body = {
    name: params.name,
    object_story_spec: objectStorySpec,
    asset_feed_spec: params.assetFeedSpec,
  }

  const res = await fetch(metaUrl(`${params.adAccountId}/adcreatives`, params.token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  await assertMetaOk(res, "Meta placement ad creative creation")

  const json = (await res.json()) as MetaIdResponse
  if (!json.id) throw new Error("Meta placement ad creative response did not include an id")
  return json.id
}

async function createMetaStaticCreative(params: {
  token: string
  adAccountId: string
  pageId: string
  imageHash: string
  name: string
  landingUrl: string
  primaryCopy: string
  headline: string
  subtext: string | null
  brief: CreativeBrief
}) {
  const ctaType = ctaToMetaEnumFromBrief(params.brief)
  const body = {
    name: params.name,
    object_story_spec: {
      page_id: params.pageId,
      link_data: {
        image_hash: params.imageHash,
        link: params.landingUrl,
        message: params.primaryCopy,
        name: params.headline,
        description: params.subtext ?? "",
        call_to_action: {
          type: ctaType,
          value: { link: params.landingUrl },
        },
      },
    },
  }

  const res = await fetch(metaUrl(`${params.adAccountId}/adcreatives`, params.token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  await assertMetaOk(res, "Meta ad creative creation")

  const json = (await res.json()) as MetaIdResponse
  if (!json.id) throw new Error("Meta ad creative response did not include an id")
  return json.id
}

async function createMetaVideoCreative(params: {
  token: string
  adAccountId: string
  pageId: string
  name: string
  videoId: string
  thumbnailImageHash: string
  landingUrl: string
  primaryCopy: string
  headline: string | null
  brief: CreativeBrief
}) {
  const videoData: Record<string, unknown> = {
    video_id: params.videoId,
    image_hash: params.thumbnailImageHash,
    message: params.primaryCopy,
    call_to_action: {
      type: ctaToMetaEnumFromBrief(params.brief),
      value: { link: params.landingUrl },
    },
  }
  if (params.headline?.trim()) {
    videoData.title = params.headline.trim()
  }

  const body = {
    name: params.name,
    object_story_spec: {
      page_id: params.pageId,
      video_data: videoData,
    },
  }

  const res = await fetch(metaUrl(`${params.adAccountId}/adcreatives`, params.token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  await assertMetaOk(res, "Meta video ad creative creation")

  const json = (await res.json()) as MetaIdResponse
  if (!json.id) throw new Error("Meta video ad creative response did not include an id")
  return json.id
}

async function createMetaAd(params: {
  token: string
  adAccountId: string
  adsetId: string
  creativeId: string
  name: string
  status: LaunchStatus
}) {
  const body = {
    name: params.name,
    adset_id: params.adsetId,
    creative: { creative_id: params.creativeId },
    status: params.status,
  }

  const res = await fetch(metaUrl(`${params.adAccountId}/ads`, params.token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  await assertMetaOk(res, "Meta ad creation")

  const json = (await res.json()) as MetaIdResponse
  if (!json.id) throw new Error("Meta ad response did not include an id")
  return json.id
}

function parseAssetIds(body: LaunchCreativeBody | null): string[] {
  if (Array.isArray(body?.assetIds)) {
    return body.assetIds
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => UUID_RE.test(value))
  }
  const single = typeof body?.assetId === "string" ? body.assetId.trim() : ""
  return UUID_RE.test(single) ? [single] : []
}

async function launchPlacementBundle(params: {
  admin: NonNullable<Awaited<ReturnType<typeof requireAdminApi>>["admin"]>
  token: string
  adAccountId: string
  pageId: string
  adsetId: string
  assetIds: string[]
  launchStatus: LaunchStatus
}) {
  const { data: rows, error } = await params.admin
    .from("creative_assets")
    .select(
      "id, brief_id, asset_type, generation_tool, variation_index, variation_label, format, gcs_path, convention_name, status, meta_ad_id, creative_briefs(id, copy_primary, copy_headline, copy_subtext, cta, hook, campaign_short_name, trigger_data)"
    )
    .in("id", params.assetIds)

  if (error) throw error
  const assets = (rows ?? []) as CreativeAssetRow[]
  if (assets.length !== params.assetIds.length) {
    return jsonError("One or more creative assets were not found", 404)
  }

  const bundleError = validatePlacementBundle(assets)
  if (bundleError) return jsonError(bundleError, 400)

  const rawBrief = firstBrief(assets[0]!)
  if (!rawBrief) return jsonError("Creative brief not found for bundle", 404)
  if (!assets[0]!.brief_id) return jsonError("Creative asset is missing brief_id", 400)
  const brief = briefForMetaLaunch(rawBrief)
  await persistResolvedBriefCopyIfEmpty(params.admin, assets[0]!.brief_id!, rawBrief)

  const claimWarning = brief.trigger_data?.claim_warning
  if (
    claimWarning &&
    typeof claimWarning === "object" &&
    !Array.isArray(claimWarning) &&
    !(claimWarning as Record<string, unknown>).acknowledged_at
  ) {
    return jsonError(
      "Ad copy flagged for health claims — acknowledge the claim warning on the brief before launch",
      403,
      { claimWarning }
    )
  }

  if (!hasResolvableLaunchCopy(brief)) {
    return jsonError("Creative brief is missing copy_primary or copy_headline", 400)
  }

  const landingUrl = resolveLaunchLandingUrl(brief)
  const metaSubtext = truncateForMetaLinkDescription(brief.copy_subtext)
  const placementImages: PlacementImageInput[] = []

  for (const asset of assets) {
    if (!asset.gcs_path) return jsonError(`Asset ${asset.id} is missing gcs_path`, 400)
    const format = normalizeStaticFormat(asset.format)
    if (!format) return jsonError(`Asset ${asset.id} has unsupported format`, 400)

    const downloaded = await downloadCreativeAsset(asset.gcs_path)
    const imageHash = await uploadImageToMeta({
      token: params.token,
      adAccountId: params.adAccountId,
      assetId: asset.id,
      filename: downloaded.filename,
      contentType: downloaded.contentType,
      buffer: downloaded.buffer,
    })

    const { error: imageUpdateError } = await params.admin
      .from("creative_assets")
      .update({ meta_image_hash: imageHash })
      .eq("id", asset.id)
    if (imageUpdateError) throw imageUpdateError

    placementImages.push({ format, imageHash })
  }

  const adName = resolvePlacementBundleAdName(
    assets.map((asset) => asset.convention_name),
    legacyAdName(assets[0]!, brief)
  )

  const launchCopy = resolvedLaunchCopyStrings(brief)
  const instagramUserId = getMetaInstagramUserId()
  const assetFeedSpec = buildPlacementAssetFeedSpec({
    images: placementImages,
    landingUrl,
    primaryCopy: launchCopy.primaryCopy,
    headline: launchCopy.headline,
    description: metaSubtext,
    brief,
    includeInstagram: Boolean(instagramUserId),
  })

  const metaCreativeId = await createMetaPlacementCreative({
    token: params.token,
    adAccountId: params.adAccountId,
    pageId: params.pageId,
    instagramUserId,
    name: adName,
    assetFeedSpec,
  })

  const metaAdId = await createMetaAd({
    token: params.token,
    adAccountId: params.adAccountId,
    adsetId: params.adsetId,
    creativeId: metaCreativeId,
    name: adName,
    status: params.launchStatus,
  })

  const launchedAt = new Date().toISOString()
  const formats = placementImages.map((row) => row.format)

  for (const asset of assets) {
    const imageHash = placementImages.find((row) => row.format === normalizeStaticFormat(asset.format))
      ?.imageHash
    const { error: updateError } = await params.admin
      .from("creative_assets")
      .update({
        status: "launched",
        meta_creative_id: metaCreativeId,
        meta_ad_id: metaAdId,
        meta_adset_id: params.adsetId,
        launched_at: launchedAt,
        ...(imageHash ? { meta_image_hash: imageHash } : {}),
        performance_data: {
          launch_mode: "placement_bundle",
          placement_formats: formats,
        },
      })
      .eq("id", asset.id)
    if (updateError) throw updateError
  }

  await maybeMarkBriefLaunched(params.admin, assets[0]!.brief_id!)

  return NextResponse.json({
    ok: true,
    success: true,
    launchMode: "placement_bundle",
    metaAdId,
    metaCreativeId,
    adName,
    landingUrl,
    formats,
    assetIds: assets.map((asset) => asset.id),
    metaCtaType: ctaToMetaEnumFromBrief(brief),
    placementPlatforms: instagramUserId ? "facebook+instagram" : "facebook",
    adsManagerUrl: adsManagerUrl(params.adAccountId, metaAdId),
  })
}

async function maybeMarkBriefLaunched(
  admin: NonNullable<Awaited<ReturnType<typeof requireAdminApi>>["admin"]>,
  briefId: string
) {
  const { count, error: countError } = await admin
    .from("creative_assets")
    .select("id", { count: "exact", head: true })
    .eq("brief_id", briefId)
    .eq("status", "approved")

  if (countError) throw countError
  if ((count ?? 0) > 0) return

  const { error: updateError } = await admin
    .from("creative_briefs")
    .update({ status: "launched" })
    .eq("id", briefId)

  if (updateError) throw updateError
}

export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  try {
    const body = (await req.json().catch(() => null)) as LaunchCreativeBody | null
    const assetIds = parseAssetIds(body)
    const adsetId = typeof body?.adsetId === "string" ? body.adsetId.trim() : ""
    if (assetIds.length === 0) {
      return jsonError("assetId or assetIds (UUID array) is required", 400)
    }
    if (!adsetId) return jsonError("adsetId is required", 400)
    if (
      body?.status !== undefined &&
      (typeof body.status !== "string" || !LAUNCH_STATUSES.has(body.status as LaunchStatus))
    ) {
      return jsonError("status must be PAUSED or ACTIVE", 400)
    }

    const token = getMetaMarketingApiToken()
    const adAccountId = getMetaAdAccountId()
    if (!adAccountId.startsWith("act_")) {
      throw new Error(
        `META_AD_ACCOUNT_ID must resolve to act_<id>; got "${adAccountId}". Fix env or redeploy latest launch-creative.`
      )
    }
    console.log("[launch-creative] using ad account", adAccountId)
    const pageId = getMetaPageId()

    const launchStatus: LaunchStatus =
      body?.status === "ACTIVE" ? "ACTIVE" : "PAUSED"

    if (assetIds.length > 1 || (assetIds.length === 1 && body?.assetIds)) {
      const { data: probeRows } = await admin!
        .from("creative_assets")
        .select("id, brief_id, asset_type, generation_tool, variation_label, format, status, meta_ad_id")
        .in("id", assetIds)
      const probeAssets = (probeRows ?? []) as LaunchableAssetRow[]
      if (canLaunchAsPlacementBundle(probeAssets)) {
        return launchPlacementBundle({
          admin: admin!,
          token,
          adAccountId,
          pageId,
          adsetId,
          assetIds,
          launchStatus,
        })
      }
      if (assetIds.length > 1) {
        const bundleError = validatePlacementBundle(probeAssets)
        return jsonError(bundleError ?? "Cannot launch selected assets as one placement bundle", 400)
      }
    }

    const assetId = assetIds[0]!

    const { data: asset, error: assetError } = await admin!
      .from("creative_assets")
      .select(
        "id, brief_id, asset_type, generation_tool, variation_index, variation_label, gcs_path, convention_name, status, meta_ad_id, performance_data, creative_briefs(id, copy_primary, copy_headline, copy_subtext, cta, hook, campaign_short_name, trigger_data)"
      )
      .eq("id", assetId)
      .maybeSingle()

    if (assetError) throw assetError
    if (!asset) return jsonError("Creative asset not found", 404)

    const creativeAsset = asset as CreativeAssetRow
    const rawBrief = firstBrief(creativeAsset)
    if (!creativeAsset.brief_id) return jsonError("Creative asset is missing brief_id", 400)
    if (!rawBrief) return jsonError("Creative brief not found for asset", 404)
    const brief = briefForMetaLaunch(rawBrief)
    await persistResolvedBriefCopyIfEmpty(admin!, creativeAsset.brief_id, rawBrief)
    if (!creativeAsset.gcs_path) return jsonError("Creative asset is missing gcs_path", 400)

    const claimWarning = brief.trigger_data?.claim_warning
    if (
      claimWarning &&
      typeof claimWarning === "object" &&
      !Array.isArray(claimWarning) &&
      !(claimWarning as Record<string, unknown>).acknowledged_at
    ) {
      return jsonError(
        "Ad copy flagged for health claims — acknowledge the claim warning on the brief before launch",
        403,
        { claimWarning }
      )
    }

    const tool = creativeAsset.generation_tool ?? ""
    if (BASE_VIDEO_TOOLS.has(tool)) {
      return jsonError(
        "Cannot push base video to Meta — only rendered variants (composite-video) are launchable",
        400
      )
    }

    if (creativeAsset.status === "launched" && creativeAsset.meta_ad_id) {
      return jsonError("Asset already launched", 409, { metaAdId: creativeAsset.meta_ad_id })
    }

    const isVideo = VIDEO_LAUNCH_TOOLS.has(tool)
    const adName = resolveAdName(creativeAsset, brief)
    const singleLaunchStatus: LaunchStatus = isVideo ? "PAUSED" : launchStatus
    const landingUrl = resolveLaunchLandingUrl(brief)
    const preflightWarnings = collectLaunchPreflightWarnings(brief, { isVideo })
    if (preflightWarnings.length > 0) {
      console.warn("[launch-creative] preflight warnings", {
        assetId,
        warnings: preflightWarnings,
      })
    }

    let metaCreativeId: string
    let imageHash: string | undefined
    let videoMetaFields: { meta_video_id?: string; meta_thumbnail_image_hash?: string } = {}

    if (isVideo) {
      const primaryCopy = brief.copy_primary?.trim() || brief.hook?.trim() || ""
      if (!primaryCopy) {
        return jsonError("Creative brief needs copy_primary or hook for video ad message", 400)
      }

      const signedUrl = await getSignedGcsReadUrl(creativeAsset.gcs_path, { expiresInSec: 3600 })
      const { videoId, thumbnailImageHash } = await uploadVideo({
        fileUrl: signedUrl,
        name: adName,
      })
      videoMetaFields = {
        meta_video_id: videoId,
        meta_thumbnail_image_hash: thumbnailImageHash,
      }

      const videoHeadline = resolvedLaunchCopyStrings(brief).headline
      metaCreativeId = await createMetaVideoCreative({
        token,
        adAccountId,
        pageId,
        name: adName,
        videoId,
        thumbnailImageHash,
        landingUrl,
        primaryCopy,
        headline: videoHeadline,
        brief,
      })
    } else {
      if (creativeAsset.asset_type !== "image") {
        return jsonError("Creative asset must be an image or rendered video", 400)
      }
      if (!hasResolvableLaunchCopy(brief)) {
        return jsonError("Creative brief is missing copy_primary or copy_headline", 400)
      }

      const downloaded = await downloadCreativeAsset(creativeAsset.gcs_path)
      imageHash = await uploadImageToMeta({
        token,
        adAccountId,
        assetId,
        filename: downloaded.filename,
        contentType: downloaded.contentType,
        buffer: downloaded.buffer,
      })

      const { error: imageUpdateError } = await admin!
        .from("creative_assets")
        .update({ meta_image_hash: imageHash })
        .eq("id", assetId)
      if (imageUpdateError) throw imageUpdateError

      const rawSubtext = brief.copy_subtext?.trim() ?? ""
      const metaSubtext = truncateForMetaLinkDescription(brief.copy_subtext)
      if (rawSubtext.length > metaSubtext.length) {
        console.log("[launch-creative] truncated link description for Meta", {
          assetId,
          fromChars: rawSubtext.length,
          toChars: metaSubtext.length,
        })
      }

      const staticCopy = resolvedLaunchCopyStrings(brief)
      metaCreativeId = await createMetaStaticCreative({
        token,
        adAccountId,
        pageId,
        imageHash,
        name: adName,
        landingUrl,
        primaryCopy: staticCopy.primaryCopy,
        headline: staticCopy.headline,
        subtext: metaSubtext,
        brief,
      })
    }

    const { error: creativeUpdateError } = await admin!
      .from("creative_assets")
      .update({ meta_creative_id: metaCreativeId })
      .eq("id", assetId)
    if (creativeUpdateError) throw creativeUpdateError

    const metaAdId = await createMetaAd({
      token,
      adAccountId,
      adsetId,
      creativeId: metaCreativeId,
      name: adName,
      status: singleLaunchStatus,
    })

    const launchedAt = new Date().toISOString()
    const { error: updateError } = await admin!
      .from("creative_assets")
      .update({
        status: "launched",
        meta_creative_id: metaCreativeId,
        meta_ad_id: metaAdId,
        meta_adset_id: adsetId,
        launched_at: launchedAt,
        ...(imageHash ? { meta_image_hash: imageHash } : {}),
        ...videoMetaFields,
        performance_data: {
          ...(creativeAsset.performance_data &&
          typeof creativeAsset.performance_data === "object"
            ? creativeAsset.performance_data
            : {}),
          launch_mode: "single",
        },
      })
      .eq("id", assetId)

    if (updateError) throw updateError
    await maybeMarkBriefLaunched(admin!, creativeAsset.brief_id)

    return NextResponse.json({
      ok: true,
      success: true,
      launchMode: "single",
      metaAdId,
      metaCreativeId,
      adName,
      landingUrl,
      metaCtaType: ctaToMetaEnumFromBrief(brief),
      preflightWarnings,
      ...videoMetaFields,
      adsManagerUrl: adsManagerUrl(adAccountId, metaAdId),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown launch error"
    console.error("[launch-creative] failed", err)
    return jsonError(message, 500)
  }
}
