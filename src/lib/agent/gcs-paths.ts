// Path builder utilities for thrml creative GCS buckets.
// Unified taxonomy: {year}/{month}/{category}/{angle}/Static|Video/{variant}_{format}.{ext}
// Legacy bases/renders paths remain readable via asset library.

/** Legacy default when env is unset; prefer resolveCreativeBucketName() for writes/URLs. */
export const BUCKET_NAME = process.env.GCS_CREATIVE_BUCKET ?? "thrml-creative"

/** Same resolution as getCreativeBucket() in gcs.ts */
export function resolveCreativeBucketName(mainBucket?: string) {
  return process.env.GCS_CREATIVE_BUCKET?.trim() || mainBucket?.trim() || process.env.GCS_BUCKET_NAME?.trim() || BUCKET_NAME
}

export interface BasePathArgs {
  date: Date
  conceptSlug: string
  assetSlug: string
  source: "uploaded" | "runway"
  version?: number
  taskId?: string
  /** Unified taxonomy: e.g. "Hosts" */
  category?: string
  /** Unified taxonomy: e.g. "pov_earnings" */
  angleSlug?: string
}

export interface RenderPathArgs {
  date: Date
  conceptSlug: string
  variantSlug: string
  templateVersion: number
  category?: string
  angleSlug?: string
}

export interface UnifiedStaticPathArgs {
  date: Date
  category: string
  angleSlug: string
  variant: string
  format: "1x1" | "9x16" | "4x5"
  ext?: string
}

export interface UnifiedVideoBasePathArgs {
  date: Date
  category: string
  angleSlug: string
  assetSlug: string
  source: "uploaded" | "runway"
  version?: number
  taskId?: string
}

export interface UnifiedVideoRenderPathArgs {
  date: Date
  category: string
  angleSlug: string
  variantSlug: string
  templateVersion: number
}

function yyyy(d: Date): string {
  return d.getUTCFullYear().toString()
}

function mm(d: Date): string {
  return (d.getUTCMonth() + 1).toString().padStart(2, "0")
}

function slug(value: string): string {
  return value.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase()
}

/** Unified static output path on main bucket. */
export function unifiedStaticPath(args: UnifiedStaticPathArgs): string {
  const ext = args.ext ?? "png"
  return `${yyyy(args.date)}/${mm(args.date)}/${slug(args.category)}/${slug(args.angleSlug)}/Static/${args.variant}_${args.format}.${ext}`
}

/** Unified video base path on creative bucket. */
export function unifiedVideoBasePath(args: UnifiedVideoBasePathArgs): string {
  const { date, category, angleSlug, assetSlug, source, version = 1, taskId } = args
  const prefix = `${yyyy(date)}/${mm(date)}/${slug(category)}/${slug(angleSlug)}/Video`
  if (source === "runway") {
    if (!taskId) throw new Error("taskId required for runway source")
    return `${prefix}/base_${slug(assetSlug)}_runway_${taskId}.mp4`
  }
  return `${prefix}/base_${slug(assetSlug)}_v${version}.mp4`
}

/** Unified composited video render path on creative bucket. */
export function unifiedVideoRenderPath(args: UnifiedVideoRenderPathArgs): string {
  const { date, category, angleSlug, variantSlug, templateVersion } = args
  return `${yyyy(date)}/${mm(date)}/${slug(category)}/${slug(angleSlug)}/Video/${slug(variantSlug)}_9x16_v${templateVersion}.mp4`
}

/**
 * Build the GCS object path for a base video (raw input).
 * Uses unified taxonomy when category/angleSlug provided; otherwise legacy bases/ path.
 */
export function baseVideoPath(args: BasePathArgs): string {
  if (args.category && args.angleSlug) {
    return unifiedVideoBasePath({
      date: args.date,
      category: args.category,
      angleSlug: args.angleSlug,
      assetSlug: args.assetSlug,
      source: args.source,
      version: args.version,
      taskId: args.taskId,
    })
  }

  const { date, conceptSlug, assetSlug, source, version = 1, taskId } = args
  const folder = `bases/${yyyy(date)}/${mm(date)}/${conceptSlug}`
  if (source === "runway") {
    if (!taskId) throw new Error("taskId required for runway source")
    return `${folder}/${assetSlug}_runway_${taskId}.mp4`
  }
  return `${folder}/${assetSlug}_v${version}.mp4`
}

/**
 * Build the GCS object path for a rendered (composited) video.
 */
export function renderedVideoPath(args: RenderPathArgs): string {
  if (args.category && args.angleSlug) {
    return unifiedVideoRenderPath({
      date: args.date,
      category: args.category,
      angleSlug: args.angleSlug,
      variantSlug: args.variantSlug,
      templateVersion: args.templateVersion ?? 1,
    })
  }

  const { date, conceptSlug, variantSlug, templateVersion = 1 } = args
  return `renders/${yyyy(date)}/${mm(date)}/${conceptSlug}/${variantSlug}_v${templateVersion}.mp4`
}

export function gcsUrl(objectPath: string, bucket = resolveCreativeBucketName()): string {
  return `gs://${bucket}/${objectPath}`
}

export function gcsPublicUrl(objectPath: string, bucket = resolveCreativeBucketName()): string {
  return `https://storage.googleapis.com/${bucket}/${encodeURI(objectPath)}`
}

/** Prefixes searched by the admin asset library. */
export const ASSET_LIBRARY_PREFIXES = ["bases/", "renders/", "20"] as const

export function parseUnifiedPath(objectPath: string): {
  year?: string
  month?: string
  category?: string
  angle?: string
  mediaType?: "Static" | "Video"
  filename?: string
} | null {
  const parts = objectPath.split("/")
  if (parts.length < 6) return null
  if (!/^\d{4}$/.test(parts[0]) || !/^\d{2}$/.test(parts[1])) return null
  const mediaType = parts[4] === "Static" || parts[4] === "Video" ? parts[4] : undefined
  if (!mediaType) return null
  return {
    year: parts[0],
    month: parts[1],
    category: parts[2],
    angle: parts[3],
    mediaType,
    filename: parts[5],
  }
}
