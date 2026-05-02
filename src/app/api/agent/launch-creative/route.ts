import { NextRequest, NextResponse } from "next/server"

import { downloadCreativeAsset } from "@/lib/agent/gcs"
import {
  getMetaAdAccountId,
  getMetaMarketingApiToken,
} from "@/lib/agent/meta-api"
import { requireAdminApi } from "@/lib/admin-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const LANDING_URL = "https://usethrml.com"
const META_GRAPH_BASE = "https://graph.facebook.com/v21.0"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i
type LaunchStatus = "PAUSED" | "ACTIVE"
const LAUNCH_STATUSES = new Set<LaunchStatus>(["PAUSED", "ACTIVE"])

const CTA_TO_META_ENUM: Record<string, string> = {
  "Book Now": "BOOK_TRAVEL",
  "Find Your Space": "LEARN_MORE",
  "Reserve Your Hour": "BOOK_TRAVEL",
  "Explore Spaces": "LEARN_MORE",
  "See What's Near You": "LEARN_MORE",
}

type LaunchCreativeBody = {
  assetId?: unknown
  adsetId?: unknown
  status?: unknown
}

type CreativeBrief = {
  id: string
  copy_primary: string | null
  copy_headline: string | null
  copy_subtext: string | null
  cta: string | null
  campaign_short_name: string | null
}

type CreativeAssetRow = {
  id: string
  brief_id: string | null
  asset_type: string | null
  variation_index: number | null
  variation_label: string | null
  gcs_path: string | null
  creative_briefs: CreativeBrief | CreativeBrief[] | null
}

type MetaIdResponse = {
  id?: string
}

type MetaAdImageUploadResponse = {
  images?: Record<string, { hash?: string }>
  hash?: string
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
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

async function assertMetaOk(res: Response, action: string) {
  if (res.ok) return
  throw new Error(`${action} failed: ${JSON.stringify(await readMetaError(res))}`)
}

function firstBrief(asset: CreativeAssetRow) {
  return Array.isArray(asset.creative_briefs) ? asset.creative_briefs[0] ?? null : asset.creative_briefs
}

function ctaToMetaEnum(cta: string | null) {
  const value = cta?.trim() || "Book Now"
  const metaEnum = CTA_TO_META_ENUM[value]
  if (!metaEnum) throw new Error(`Unsupported creative brief CTA: ${value}`)
  return metaEnum
}

function extractImageHash(json: MetaAdImageUploadResponse) {
  if (json.hash) return json.hash
  const firstImage = Object.values(json.images ?? {})[0]
  return firstImage?.hash ?? null
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

async function createMetaCreative(params: {
  token: string
  adAccountId: string
  pageId: string
  imageHash: string
  primaryCopy: string
  headline: string
  subtext: string | null
  cta: string | null
}) {
  const body = {
    name: params.headline,
    object_story_spec: {
      page_id: params.pageId,
      link_data: {
        image_hash: params.imageHash,
        link: LANDING_URL,
        message: params.primaryCopy,
        name: params.headline,
        description: params.subtext ?? "",
        call_to_action: {
          type: ctaToMetaEnum(params.cta),
          value: { link: LANDING_URL },
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

function adName(asset: CreativeAssetRow, brief: CreativeBrief) {
  const campaign = brief.campaign_short_name?.trim() || "creative"
  const variation = asset.variation_label?.trim() || `variation-${asset.variation_index ?? 1}`
  return `${campaign}_${variation}_${asset.id.slice(0, 8)}`
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
    const assetId = typeof body?.assetId === "string" ? body.assetId.trim() : ""
    const adsetId = typeof body?.adsetId === "string" ? body.adsetId.trim() : ""
    if (!UUID_RE.test(assetId)) return jsonError("assetId must be a valid UUID", 400)
    if (!adsetId) return jsonError("adsetId is required", 400)
    if (
      body?.status !== undefined &&
      (typeof body.status !== "string" || !LAUNCH_STATUSES.has(body.status as LaunchStatus))
    ) {
      return jsonError("status must be PAUSED or ACTIVE", 400)
    }
    const status: LaunchStatus = body?.status === "ACTIVE" ? "ACTIVE" : "PAUSED"

    const token = getMetaMarketingApiToken()
    const adAccountId = getMetaAdAccountId()
    const pageId = requiredEnv("META_PAGE_ID")

    const { data: asset, error: assetError } = await admin!
      .from("creative_assets")
      .select(
        "id, brief_id, asset_type, variation_index, variation_label, gcs_path, creative_briefs(id, copy_primary, copy_headline, copy_subtext, cta, campaign_short_name)"
      )
      .eq("id", assetId)
      .maybeSingle()

    if (assetError) throw assetError
    if (!asset) return jsonError("Creative asset not found", 404)

    const creativeAsset = asset as CreativeAssetRow
    const brief = firstBrief(creativeAsset)
    if (!creativeAsset.brief_id) return jsonError("Creative asset is missing brief_id", 400)
    if (creativeAsset.asset_type !== "image") return jsonError("Creative asset must be an image", 400)
    if (!creativeAsset.gcs_path) return jsonError("Creative asset is missing gcs_path", 400)
    if (!brief?.copy_primary || !brief.copy_headline) {
      return jsonError("Creative brief is missing copy_primary or copy_headline", 400)
    }

    const downloaded = await downloadCreativeAsset(creativeAsset.gcs_path)
    const imageHash = await uploadImageToMeta({
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

    const metaCreativeId = await createMetaCreative({
      token,
      adAccountId,
      pageId,
      imageHash,
      primaryCopy: brief.copy_primary,
      headline: brief.copy_headline,
      subtext: brief.copy_subtext,
      cta: brief.cta,
    })

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
      name: adName(creativeAsset, brief),
      status,
    })

    const launchedAt = new Date().toISOString()
    const { error: updateError } = await admin!
      .from("creative_assets")
      .update({
        status: "launched",
        meta_image_hash: imageHash,
        meta_creative_id: metaCreativeId,
        meta_ad_id: metaAdId,
        meta_adset_id: adsetId,
        launched_at: launchedAt,
      })
      .eq("id", assetId)

    if (updateError) throw updateError
    await maybeMarkBriefLaunched(admin!, creativeAsset.brief_id)

    return NextResponse.json({
      metaAdId,
      metaCreativeId,
      adsManagerUrl: adsManagerUrl(adAccountId, metaAdId),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown launch error"
    console.error("[launch-creative] failed", err)
    return jsonError(message, 500)
  }
}
