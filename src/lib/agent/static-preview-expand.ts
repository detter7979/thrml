import { downloadCreativeAsset, uploadCreativeAsset as uploadGcsCreativeAsset } from "@/lib/agent/gcs"
import { resolveNamingFromBrief } from "@/lib/agent/creative-templates"
import { resolveCreativeBucketName, unifiedStaticBasePath, unifiedStaticPath } from "@/lib/agent/gcs-paths"
import {
  HOST_PROOF_SUBTEXT,
  finalizeHostStaticImagePrompt,
  parseStoredStaticVariations,
  type StoredStaticVariation,
} from "@/lib/agent/host-monetization-static"
import { buildAdName } from "@/lib/agent/naming-builder"
import { SPLIT_HEADER_DEFAULTS } from "@/lib/agent/svg-template-shared"
import {
  briefUsesSvgTemplate,
  formatToAspectRatio,
  generateFromSvgTemplate,
  type SvgStaticFormat,
} from "@/lib/agent/svg-template-generator"
import {
  missingFormatsForVariation,
  normalizeStaticFormat,
  previewFormatForBrief,
  targetFormatsForBrief,
  type StaticFormat,
} from "@/lib/agent/static-brief-plan"
import {
  compositeStatic,
  generateLifestyleImage,
  type StaticVariationCount,
} from "@/lib/agent/static-generator"
import { resolveBasePhotoBuffer } from "@/lib/agent/static-photo-recomposite"
import { createAdminClient } from "@/lib/supabase/admin"

export type { StaticFormat }

type BriefRow = {
  id: string
  trigger_type: string | null
  trigger_data: Record<string, unknown> | null
  format: string | null
  success_criteria: Record<string, unknown> | null
  visual_direction: string | null
  copy_primary: string | null
  copy_headline: string | null
  copy_subtext: string | null
  campaign_short_name: string | null
}

type AssetRow = {
  id: string
  brief_id: string
  format: string | null
  variation_label: string | null
  variation_index: number | null
  generation_tool: string | null
  gcs_path: string | null
  performance_data: Record<string, unknown> | null
  created_at?: string | null
}

const VARIATION_LABELS = ["A", "B", "C"] as const

function sanitizeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)
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
  return resolveNamingFromBrief(brief)?.template_slug ?? null
}

function conventionNameForStatic(brief: BriefRow, format: StaticFormat, variationLabel: string): string | null {
  const naming = resolveNamingFromBrief(brief)
  if (!naming) return null
  const formatToken = naming.format.includes("Static") ? `Static_${format}` : naming.format
  try {
    return buildAdName({
      testId: naming.test_id,
      variant: variationLabel.toUpperCase().slice(0, 1) as "A" | "B" | "C" | "D",
      angle: typeof brief.trigger_data?.angle === "string" ? brief.trigger_data.angle : "pov_earnings",
      format: formatToken,
      cta: naming.cta,
    })
  } catch {
    return null
  }
}

function performanceData(asset: AssetRow): Record<string, unknown> {
  return asset.performance_data && typeof asset.performance_data === "object" ? asset.performance_data : {}
}

export function inferredStaticBaseGcsPath(sourceAsset: AssetRow, brief: BriefRow): string | null {
  const format = normalizeStaticFormat(sourceAsset.format) ?? "1x1"
  const variationLabel = (sourceAsset.variation_label ?? "A").toUpperCase().slice(0, 1)
  const { category, angleSlug } = taxonomyFromBrief(brief)
  const templateSlug = templateSlugFromBrief(brief) ?? undefined
  const objectPath = unifiedStaticBasePath({
    date: sourceAsset.created_at ? new Date(sourceAsset.created_at) : new Date(),
    category,
    angleSlug,
    variant: variationLabel,
    format,
    templateSlug,
  })
  return `gs://${resolveCreativeBucketName()}/${objectPath}`
}

async function resolveExpandBasePhotoBuffer(
  sourceAsset: AssetRow,
  brief: BriefRow,
): Promise<{ buffer: Buffer; source: string; baseGcsPath: string }> {
  const perf = performanceData(sourceAsset)
  const storedBasePath = typeof perf.base_gcs_path === "string" ? perf.base_gcs_path.trim() : ""

  const candidates = [
    storedBasePath,
    inferredStaticBaseGcsPath(sourceAsset, brief),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    try {
      const downloaded = await downloadCreativeAsset(candidate)
      return { buffer: downloaded.buffer, source: candidate, baseGcsPath: candidate }
    } catch {
      // try next candidate
    }
  }

  try {
    const { buffer, source } = await resolveBasePhotoBuffer(sourceAsset)
    const baseGcsPath = storedBasePath || source
    return { buffer, source, baseGcsPath }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Could not load the preview base photo (${detail}). Regenerate the preview, then build out remaining sizes.`,
    )
  }
}

function resolveStaticPlan(brief: BriefRow): StoredStaticVariation[] | null {
  return parseStoredStaticVariations(brief.trigger_data)
}

function resolveVariationStep(brief: BriefRow, variationLabel: string): StoredStaticVariation | null {
  const plan = resolveStaticPlan(brief)
  const label = variationLabel.toUpperCase().slice(0, 1)
  const fromPlan = plan?.find((row) => row.variation_label.toUpperCase().slice(0, 1) === label)
  if (fromPlan) return fromPlan
  if (label === "A" && brief.visual_direction?.trim()) {
    return {
      variation_label: "A",
      headline: brief.copy_headline?.trim() || brief.copy_primary?.trim() || "Turn your idle sauna into income.",
      background_image_prompt: brief.visual_direction.trim(),
    }
  }
  return null
}

async function loadBriefAndAssets(admin: ReturnType<typeof createAdminClient>, briefId: string) {
  const { data: brief, error: briefError } = await admin
    .from("creative_briefs")
    .select(
      "id, trigger_type, trigger_data, format, success_criteria, visual_direction, copy_primary, copy_headline, copy_subtext, campaign_short_name",
    )
    .eq("id", briefId)
    .maybeSingle()

  if (briefError) throw briefError
  if (!brief) throw new Error("Creative brief not found")

  const { data: assets, error: assetsError } = await admin
    .from("creative_assets")
    .select(
      "id, brief_id, format, variation_label, variation_index, generation_tool, gcs_path, performance_data, created_at",
    )
    .eq("brief_id", briefId)

  if (assetsError) throw assetsError

  return { brief: brief as BriefRow, assets: (assets ?? []) as AssetRow[] }
}

async function persistExpandedPhotoAsset(opts: {
  brief: BriefRow
  sourceAsset: AssetRow
  baseBuffer: Buffer
  baseGcsPath: string
  format: StaticFormat
  variationLabel: string
  variationIndex: number
  headline: string
  generationTool: string
}) {
  const admin = createAdminClient()
  const composite = await compositeStatic({
    baseImage: opts.baseBuffer,
    format: opts.format,
    copyPrimary: opts.brief.copy_primary,
    copyHeadline: opts.headline,
    copySubtext: opts.brief.copy_subtext ?? HOST_PROOF_SUBTEXT,
    copyTaglineEyebrow: taglineEyebrowFromBrief(opts.brief.trigger_data),
  })

  const { category, angleSlug } = taxonomyFromBrief(opts.brief)
  const templateSlug = templateSlugFromBrief(opts.brief) ?? undefined
  const unifiedPath = unifiedStaticPath({
    date: new Date(),
    category,
    angleSlug,
    variant: opts.variationLabel,
    format: opts.format,
    templateSlug,
  })

  const sourcePerf = performanceData(opts.sourceAsset)
  const { gcsPath, gcsUrl } = await uploadGcsCreativeAsset(composite, {
    campaignShortName: opts.brief.campaign_short_name ?? opts.brief.id,
    briefId: opts.brief.id,
    kind: "static",
    filename: `static_${opts.format}_${sanitizeFilename(`${opts.generationTool}_${opts.variationLabel}`)}.png`,
    contentType: "image/png",
    unifiedObjectPath: unifiedPath,
  })

  const { data: inserted, error: insertError } = await admin
    .from("creative_assets")
    .insert({
      brief_id: opts.brief.id,
      asset_type: "image",
      generation_tool: opts.generationTool,
      variation_index: opts.variationIndex,
      variation_label: opts.variationLabel,
      format: opts.format,
      gcs_path: gcsPath,
      gcs_url: gcsUrl,
      convention_name: conventionNameForStatic(opts.brief, opts.format, opts.variationLabel),
      status: "generated",
      performance_data: {
        ...sourcePerf,
        base_gcs_path: opts.baseGcsPath,
        expanded_from_asset_id: opts.sourceAsset.id,
        static_variation_headline: opts.headline,
        static_variation_label: opts.variationLabel,
      },
    })
    .select("id")
    .maybeSingle()

  if (insertError) throw insertError
  if (!inserted?.id) throw new Error("Failed to insert expanded creative asset")

  return inserted.id as string
}

async function expandPhotoStaticSizesFromAsset(opts: {
  sourceAsset: AssetRow
  brief: BriefRow
  formats?: StaticFormat[]
}) {
  const admin = createAdminClient()
  const variationLabel = (opts.sourceAsset.variation_label ?? "A").toUpperCase().slice(0, 1)
  const briefFormats = targetFormatsForBrief(opts.brief)
  const { data: existingAssets, error } = await admin
    .from("creative_assets")
    .select("format, variation_label")
    .eq("brief_id", opts.brief.id)

  if (error) throw error

  const formats = (opts.formats?.length
    ? opts.formats
    : missingFormatsForVariation(briefFormats, existingAssets ?? [], variationLabel)
  ).filter((format) => format !== normalizeStaticFormat(opts.sourceAsset.format))

  if (!formats.length) {
    return { generated: 0, assetIds: [] as string[] }
  }

  const { buffer: baseBuffer, baseGcsPath: resolvedBasePath } = await resolveExpandBasePhotoBuffer(
    opts.sourceAsset,
    opts.brief,
  )
  const perf = performanceData(opts.sourceAsset)
  const headline =
    (typeof perf.static_variation_headline === "string" && perf.static_variation_headline.trim()) ||
    opts.brief.copy_headline?.trim() ||
    opts.brief.copy_primary?.trim() ||
    "Turn your idle sauna into income."
  const generationTool = opts.sourceAsset.generation_tool ?? "replicate_mj"
  const variationIndex = opts.sourceAsset.variation_index ?? 1

  let baseGcsPath = typeof perf.base_gcs_path === "string" ? perf.base_gcs_path.trim() : ""
  if (!baseGcsPath) {
    baseGcsPath = resolvedBasePath
    await admin
      .from("creative_assets")
      .update({
        performance_data: {
          ...perf,
          base_gcs_path: baseGcsPath,
        },
      })
      .eq("id", opts.sourceAsset.id)
  }

  const assetIds: string[] = []
  for (const format of formats) {
    const assetId = await persistExpandedPhotoAsset({
      brief: opts.brief,
      sourceAsset: opts.sourceAsset,
      baseBuffer,
      baseGcsPath,
      format,
      variationLabel,
      variationIndex,
      headline,
      generationTool,
    })
    assetIds.push(assetId)
  }

  await admin.from("creative_briefs").update({ status: "variations_ready" }).eq("id", opts.brief.id)

  return { generated: assetIds.length, assetIds }
}

async function expandSvgStaticSizesFromAsset(opts: {
  sourceAsset: AssetRow
  brief: BriefRow
  formats?: StaticFormat[]
}) {
  const admin = createAdminClient()
  const td = opts.brief.trigger_data ?? {}
  const templateId = typeof td.svg_template_id === "string" ? td.svg_template_id : null
  if (!templateId) throw new Error("Brief is missing svg_template_id")

  const perf = performanceData(opts.sourceAsset)
  const tokens =
    perf.svg_tokens && typeof perf.svg_tokens === "object" && !Array.isArray(perf.svg_tokens)
      ? (perf.svg_tokens as Record<string, string>)
      : td.svg_tokens && typeof td.svg_tokens === "object" && !Array.isArray(td.svg_tokens)
        ? (td.svg_tokens as Record<string, string>)
        : {}

  const photoGcsPath =
    (typeof perf.photo_gcs_path === "string" && perf.photo_gcs_path.trim()) ||
    (typeof perf.base_gcs_path === "string" && perf.base_gcs_path.trim()) ||
    (typeof td.photo_gcs_path === "string" ? td.photo_gcs_path.trim() : null)

  const variationLabel = (opts.sourceAsset.variation_label ?? "A").toUpperCase().slice(0, 1)
  const briefFormats = targetFormatsForBrief(opts.brief).filter((format): format is SvgStaticFormat =>
    format === "1x1" || format === "4x5" || format === "9x16",
  )

  const { data: existingAssets, error } = await admin
    .from("creative_assets")
    .select("format, variation_label")
    .eq("brief_id", opts.brief.id)

  if (error) throw error

  const formats = (opts.formats?.length
    ? opts.formats
    : missingFormatsForVariation(briefFormats, existingAssets ?? [], variationLabel)
  ).filter((format) => format !== normalizeStaticFormat(opts.sourceAsset.format))

  if (!formats.length) return { generated: 0, assetIds: [] as string[] }

  const assetIds: string[] = []
  for (const format of formats) {
    const result = await generateFromSvgTemplate(
      opts.brief.id,
      templateId,
      formatToAspectRatio(format as SvgStaticFormat),
      tokens,
      photoGcsPath,
      {
        variationLabel,
        variationIndex: opts.sourceAsset.variation_index ?? 1,
      },
    )
    assetIds.push(result.assetId)
  }

  await admin.from("creative_briefs").update({ status: "variations_ready" }).eq("id", opts.brief.id)

  return { generated: assetIds.length, assetIds }
}

export async function expandStaticSizesFromAsset(opts: { assetId: string; formats?: StaticFormat[] }) {
  const admin = createAdminClient()
  const { data: asset, error: assetError } = await admin
    .from("creative_assets")
    .select(
      "id, brief_id, format, variation_label, variation_index, generation_tool, gcs_path, performance_data, created_at",
    )
    .eq("id", opts.assetId)
    .maybeSingle()

  if (assetError) throw assetError
  if (!asset) throw new Error("Asset not found")

  const { brief } = await loadBriefAndAssets(admin, asset.brief_id)

  if (briefUsesSvgTemplate(brief.trigger_data)) {
    return expandSvgStaticSizesFromAsset({
      sourceAsset: asset as AssetRow,
      brief,
      formats: opts.formats,
    })
  }

  return expandPhotoStaticSizesFromAsset({
    sourceAsset: asset as AssetRow,
    brief,
    formats: opts.formats,
  })
}

export async function generateStaticVariationPreview(opts: {
  briefId: string
  variationLabel: "A" | "B" | "C"
  format?: StaticFormat
  promptOverride?: string | null
  generator?: "imagen" | "replicate" | "both"
}) {
  const admin = createAdminClient()
  const { brief, assets } = await loadBriefAndAssets(admin, opts.briefId)
  const format = opts.format ?? previewFormatForBrief(brief)
  const variationLabel = opts.variationLabel.toUpperCase().slice(0, 1) as "A" | "B" | "C"

  const existing = assets.some(
    (asset) =>
      (asset.variation_label ?? "A").toUpperCase().slice(0, 1) === variationLabel &&
      normalizeStaticFormat(asset.format) === format,
  )
  if (existing) {
    throw new Error(`Variation ${variationLabel} already exists for ${format}`)
  }

  const step = resolveVariationStep(brief, variationLabel)
  if (!step && !opts.promptOverride?.trim() && !brief.visual_direction?.trim()) {
    throw new Error(`No prompt found for variation ${variationLabel}`)
  }

  const prompt = finalizeHostStaticImagePrompt(
    opts.promptOverride?.trim() || step?.background_image_prompt || brief.visual_direction!.trim(),
  )
  const headline =
    step?.headline?.trim() ||
    brief.copy_headline?.trim() ||
    brief.copy_primary?.trim() ||
    "Turn your idle sauna into income."

  const generator = opts.generator ?? "both"
  const aspectRatio = format === "9x16" ? "9:16" : format === "4x5" ? "4:5" : "1:1"
  const baseImages = await generateLifestyleImage(prompt, {
    generator,
    aspectRatio,
    count: 1 as StaticVariationCount,
  })
  const baseImage = baseImages[0]
  if (!baseImage) throw new Error("Static generation produced no base image")

  const { category, angleSlug } = taxonomyFromBrief(brief)
  const templateSlug = templateSlugFromBrief(brief) ?? undefined
  const { gcsPath: baseGcsPath } = await uploadGcsCreativeAsset(baseImage.buffer, {
    campaignShortName: brief.campaign_short_name ?? brief.id,
    briefId: brief.id,
    kind: "static",
    filename: `base_${format}_${variationLabel}.png`,
    contentType: "image/png",
    unifiedObjectPath: unifiedStaticBasePath({
      date: new Date(),
      category,
      angleSlug,
      variant: variationLabel,
      format,
      templateSlug,
    }),
  })

  const composite = await compositeStatic({
    baseImage: baseImage.buffer,
    format,
    copyPrimary: brief.copy_primary,
    copyHeadline: headline,
    copySubtext: brief.copy_subtext ?? HOST_PROOF_SUBTEXT,
    copyTaglineEyebrow: taglineEyebrowFromBrief(brief.trigger_data),
  })

  const unifiedPath = unifiedStaticPath({
    date: new Date(),
    category,
    angleSlug,
    variant: variationLabel,
    format,
    templateSlug,
  })

  const { gcsPath, gcsUrl } = await uploadGcsCreativeAsset(composite, {
    campaignShortName: brief.campaign_short_name ?? brief.id,
    briefId: brief.id,
    kind: "static",
    filename: `static_${format}_${sanitizeFilename(`${baseImage.generationTool}_${variationLabel}`)}.png`,
    contentType: "image/png",
    unifiedObjectPath: unifiedPath,
  })

  const plan = resolveStaticPlan(brief)
  const variationIndex =
    plan?.findIndex((row) => row.variation_label.toUpperCase().slice(0, 1) === variationLabel) ?? -1

  const { data: inserted, error: insertError } = await admin
    .from("creative_assets")
    .insert({
      brief_id: brief.id,
      asset_type: "image",
      generation_tool: baseImage.generationTool,
      variation_index: variationIndex >= 0 ? variationIndex + 1 : VARIATION_LABELS.indexOf(variationLabel) + 1,
      variation_label: variationLabel,
      format,
      gcs_path: gcsPath,
      gcs_url: gcsUrl,
      convention_name: conventionNameForStatic(brief, format, variationLabel),
      status: "generated",
      performance_data: {
        source_image_url: baseImage.sourceUrl ?? null,
        source_index: baseImage.sourceIndex,
        base_mime_type: baseImage.mimeType,
        base_gcs_path: baseGcsPath,
        static_variation_headline: headline,
        static_variation_label: variationLabel,
        preview_prompt: prompt,
      },
    })
    .select("id")
    .maybeSingle()

  if (insertError) throw insertError
  if (!inserted?.id) throw new Error("Failed to insert variation preview asset")

  await admin.from("creative_briefs").update({ status: "variations_ready" }).eq("id", brief.id)

  return { assetId: inserted.id as string, format, variationLabel }
}

export { buildOutFormatsForAsset, nextVariationLabelsForBrief } from "@/lib/agent/static-brief-plan"
