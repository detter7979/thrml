import { uploadCreativeAsset as uploadGcsCreativeAsset, downloadCreativeAsset } from "@/lib/agent/gcs"
import { unifiedStaticBasePath, unifiedStaticPath } from "@/lib/agent/gcs-paths"
import { HOST_PROOF_SUBTEXT } from "@/lib/agent/host-monetization-static"
import { resolveNamingFromBrief } from "@/lib/agent/creative-templates"
import { buildAdName } from "@/lib/agent/naming-builder"
import { SPLIT_HEADER_DEFAULTS } from "@/lib/agent/svg-template-shared"
import {
  applyPhotoEditPrompt,
  applyPhotoEdits,
  parsePhotoEditInstructions,
  type PhotoGeometricEdit,
} from "@/lib/agent/static-photo-edit"
import {
  renderMasterAdTemplate,
  type MasterAdTemplateFormat,
} from "@/lib/agent/static-layouts/master-ad-template"
import { createAdminClient } from "@/lib/supabase/admin"

type StaticFormat = MasterAdTemplateFormat

async function compositeStatic(opts: {
  baseImage: Buffer
  format: StaticFormat
  copyHeadline: string
  copySubtext: string
  copyTaglineEyebrow: string
}) {
  return renderMasterAdTemplate({
    baseImage: opts.baseImage,
    format: opts.format,
    headline: opts.copyHeadline,
    subhead: opts.copySubtext,
    taglineEyebrow: opts.copyTaglineEyebrow,
  })
}

type BriefRow = {
  id: string
  copy_primary: string | null
  copy_headline: string | null
  copy_subtext: string | null
  campaign_short_name: string | null
  trigger_data: Record<string, unknown> | null
}

type AssetRow = {
  id: string
  brief_id: string
  format: string | null
  variation_label: string | null
  variation_index: number | null
  gcs_path: string | null
  performance_data: Record<string, unknown> | null
  convention_name: string | null
}

type PerformanceDataSource = {
  performance_data?: Record<string, unknown> | null
}

function performanceData(asset: PerformanceDataSource): Record<string, unknown> {
  return asset.performance_data && typeof asset.performance_data === "object"
    ? asset.performance_data
    : {}
}

function taglineEyebrowFromBrief(triggerData: Record<string, unknown> | null | undefined): string {
  const td = triggerData ?? {}
  const direct = typeof td.TAGLINE_EYEBROW === "string" ? td.TAGLINE_EYEBROW.trim() : ""
  if (direct) return direct
  const tokens = td.svg_tokens
  if (tokens && typeof tokens === "object") {
    const fromTokens = (tokens as Record<string, unknown>).TAGLINE_EYEBROW
    if (typeof fromTokens === "string" && fromTokens.trim()) return fromTokens.trim()
  }
  return SPLIT_HEADER_DEFAULTS.TAGLINE_EYEBROW
}

function taxonomyFromBrief(brief: BriefRow) {
  const td = brief.trigger_data ?? {}
  return {
    category: typeof td.category === "string" ? td.category : "Hosts",
    angleSlug: typeof td.angle === "string" ? td.angle : "pov_earnings",
  }
}

function templateSlugFromBrief(brief: BriefRow) {
  const naming = resolveNamingFromBrief(brief)
  return naming?.template_slug ?? null
}

async function downloadFromUrl(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download base photo (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

export async function resolveBasePhotoBuffer(
  asset: PerformanceDataSource,
): Promise<{ buffer: Buffer; source: string }> {
  const perf = performanceData(asset)
  const baseGcsPath = typeof perf.base_gcs_path === "string" ? perf.base_gcs_path.trim() : ""
  if (baseGcsPath) {
    const downloaded = await downloadCreativeAsset(baseGcsPath)
    return { buffer: downloaded.buffer, source: baseGcsPath }
  }

  const sourceUrl = typeof perf.source_image_url === "string" ? perf.source_image_url.trim() : ""
  if (sourceUrl) {
    return { buffer: await downloadFromUrl(sourceUrl), source: sourceUrl }
  }

  throw new Error(
    "No base photo found for this asset. Regenerate once (bases are saved automatically now) or pass a base image path to the edit script.",
  )
}

export type EditStaticPhotoOptions = {
  assetId: string
  editPrompt?: string
  geometric?: PhotoGeometricEdit
  semanticPrompt?: string
  /** When true, inserts a new creative_assets row instead of replacing the composite path. */
  saveAsNewVariant?: boolean
  /** When true, overwrites the existing composite GCS object (same path). */
  replaceInPlace?: boolean
}

export type EditStaticPhotoResult = {
  assetId: string
  baseGcsPath: string
  compositeGcsPath: string
  compositeGcsUrl: string
  editSummary: string
}

function normalizeGcsObjectPath(value: string) {
  return value.trim().replace(/^gs:\/\/[^/]+\//, "")
}

export async function findLatestAssetByGcsPath(gcsPath: string) {
  const admin = createAdminClient()
  const objectPath = normalizeGcsObjectPath(gcsPath)
  const withPrefix = gcsPath.trim().startsWith("gs://") ? gcsPath.trim() : null

  const queries = [objectPath]
  if (withPrefix) queries.push(withPrefix)

  for (const path of queries) {
    const { data, error } = await admin
      .from("creative_assets")
      .select("id, brief_id, format, variation_label, variation_index, gcs_path, performance_data, convention_name, created_at")
      .eq("gcs_path", path)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (data) return data as AssetRow & { created_at?: string }
  }

  return null
}

export async function editStaticPhotoAsset(opts: EditStaticPhotoOptions): Promise<EditStaticPhotoResult> {
  const admin = createAdminClient()

  const { data: asset, error: assetError } = await admin
    .from("creative_assets")
    .select("id, brief_id, format, variation_label, variation_index, gcs_path, performance_data, convention_name")
    .eq("id", opts.assetId)
    .maybeSingle()

  if (assetError) throw assetError
  if (!asset) throw new Error("Asset not found")

  const { data: brief, error: briefError } = await admin
    .from("creative_briefs")
    .select("id, copy_primary, copy_headline, copy_subtext, campaign_short_name, trigger_data")
    .eq("id", asset.brief_id)
    .maybeSingle()

  if (briefError) throw briefError
  if (!brief) throw new Error("Brief not found for asset")

  const format = (asset.format ?? "1x1") as StaticFormat
  const variationLabel = (asset.variation_label ?? "A").toUpperCase().slice(0, 1)
  const { buffer: baseBuffer, source: baseSource } = await resolveBasePhotoBuffer(asset as AssetRow)

  let editedBase = baseBuffer
  let editSummary = "No edits applied"

  if (opts.editPrompt?.trim()) {
    editedBase = await applyPhotoEditPrompt(baseBuffer, opts.editPrompt)
    const parsed = parsePhotoEditInstructions(opts.editPrompt)
    editSummary = [
      Object.keys(parsed.geometric).length ? `geometry: ${JSON.stringify(parsed.geometric)}` : null,
      parsed.semanticPrompt ? `semantic: ${parsed.semanticPrompt}` : null,
    ]
      .filter(Boolean)
      .join(" · ")
  } else if (opts.geometric || opts.semanticPrompt?.trim()) {
    editedBase = await applyPhotoEdits(baseBuffer, {
      geometric: opts.geometric,
      semanticPrompt: opts.semanticPrompt ?? null,
    })
    editSummary = [
      opts.geometric ? `geometry: ${JSON.stringify(opts.geometric)}` : null,
      opts.semanticPrompt ? `semantic: ${opts.semanticPrompt}` : null,
    ]
      .filter(Boolean)
      .join(" · ")
  }

  const { category, angleSlug } = taxonomyFromBrief(brief as BriefRow)
  const templateSlug = templateSlugFromBrief(brief as BriefRow) ?? undefined
  const basePath = unifiedStaticBasePath({
    date: new Date(),
    category,
    angleSlug,
    variant: variationLabel,
    format,
    templateSlug,
  })

  const { gcsPath: baseGcsPath } = await uploadGcsCreativeAsset(editedBase, {
    campaignShortName: brief.campaign_short_name ?? brief.id,
    briefId: brief.id,
    kind: "static",
    filename: `base_${format}_${variationLabel}_edited.png`,
    contentType: "image/png",
    unifiedObjectPath: basePath,
  })

  const perf = performanceData(asset as AssetRow)
  const headline =
    (typeof perf.static_variation_headline === "string" && perf.static_variation_headline.trim()) ||
    brief.copy_headline?.trim() ||
    brief.copy_primary?.trim() ||
    "Turn your idle sauna into income."
  const subhead = brief.copy_subtext?.trim() || HOST_PROOF_SUBTEXT

  const composite = await compositeStatic({
    baseImage: editedBase,
    format,
    copyHeadline: headline,
    copySubtext: subhead,
    copyTaglineEyebrow: taglineEyebrowFromBrief(brief.trigger_data),
  })

  const existingObjectPath = asset.gcs_path ? normalizeGcsObjectPath(asset.gcs_path) : null
  const compositeObjectPath =
    opts.replaceInPlace && existingObjectPath
      ? existingObjectPath
      : unifiedStaticPath({
          date: new Date(),
          category,
          angleSlug,
          variant: variationLabel,
          format,
          templateSlug,
        })

  const { gcsPath: compositeGcsPath, gcsUrl: compositeGcsUrl } = await uploadGcsCreativeAsset(composite, {
    campaignShortName: brief.campaign_short_name ?? brief.id,
    briefId: brief.id,
    kind: "static",
    filename: `static_${format}_${variationLabel}_edited.png`,
    contentType: "image/png",
    unifiedObjectPath: compositeObjectPath,
  })

  const naming = resolveNamingFromBrief(brief as BriefRow)
  const conventionName = naming
    ? buildAdName({
        testId: naming.test_id,
        variant: variationLabel,
        angle: angleSlug,
        format: naming.format,
        cta: naming.cta,
      })
    : asset.convention_name

  const nextPerformance = {
    ...perf,
    base_gcs_path: baseGcsPath,
    base_photo_source: baseSource,
    photo_edit_summary: editSummary,
    photo_edited_at: new Date().toISOString(),
  }

  if (opts.saveAsNewVariant) {
    const { data: inserted, error: insertError } = await admin
      .from("creative_assets")
      .insert({
        brief_id: brief.id,
        asset_type: "image",
        generation_tool: "replicate_mj",
        variation_index: (asset.variation_index ?? 1) + 100,
        variation_label: `${variationLabel}e`,
        format,
        gcs_path: compositeGcsPath,
        gcs_url: compositeGcsUrl,
        convention_name: conventionName,
        status: "generated",
        performance_data: nextPerformance,
      })
      .select("id")
      .maybeSingle()

    if (insertError) throw insertError
    if (!inserted?.id) throw new Error("Failed to insert edited asset")

    return {
      assetId: inserted.id,
      baseGcsPath,
      compositeGcsPath,
      compositeGcsUrl,
      editSummary,
    }
  }

  const { error: updateError } = await admin
    .from("creative_assets")
    .update({
      gcs_path: compositeGcsPath,
      gcs_url: compositeGcsUrl,
      performance_data: nextPerformance,
    })
    .eq("id", asset.id)

  if (updateError) throw updateError

  return {
    assetId: asset.id,
    baseGcsPath,
    compositeGcsPath,
    compositeGcsUrl,
    editSummary,
  }
}

export async function editStaticPhotoByGcsPath(
  gcsPath: string,
  editPrompt: string,
  opts?: { replaceInPlace?: boolean; saveAsNewVariant?: boolean },
) {
  const asset = await findLatestAssetByGcsPath(gcsPath)
  if (!asset) {
    throw new Error(`No creative_assets row found for ${gcsPath}`)
  }
  return editStaticPhotoAsset({
    assetId: asset.id,
    editPrompt,
    replaceInPlace: opts?.replaceInPlace ?? true,
    saveAsNewVariant: opts?.saveAsNewVariant ?? false,
  })
}

/** Edit a local base photo and render a Master Ad composite (no DB). */
export async function editLocalBaseAndComposite(opts: {
  baseImage: Buffer
  format: StaticFormat
  headline: string
  subhead?: string
  taglineEyebrow?: string
  editPrompt?: string
  geometric?: PhotoGeometricEdit
  semanticPrompt?: string
}) {
  let edited = opts.baseImage
  if (opts.editPrompt?.trim()) {
    edited = await applyPhotoEditPrompt(opts.baseImage, opts.editPrompt)
  } else if (opts.geometric || opts.semanticPrompt?.trim()) {
    edited = await applyPhotoEdits(opts.baseImage, {
      geometric: opts.geometric,
      semanticPrompt: opts.semanticPrompt ?? null,
    })
  }

  const composite = await compositeStatic({
    baseImage: edited,
    format: opts.format,
    copyHeadline: opts.headline,
    copySubtext: opts.subhead ?? HOST_PROOF_SUBTEXT,
    copyTaglineEyebrow: opts.taglineEyebrow ?? SPLIT_HEADER_DEFAULTS.TAGLINE_EYEBROW,
  })

  return { editedBase: edited, composite }
}
