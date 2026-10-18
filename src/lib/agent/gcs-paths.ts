// Path builder utilities for thrml creative GCS buckets.
// Creative library taxonomy (Oct 2026):
//   Static base:      {year}/{category}/{angle}/Static/base/base_{name}.{ext}
//   Static composite: {year}/{category}/{angle}/Static/composite/{name}.{ext}
//   Video base:       {year}/{category}/{angle}/Video/base/base_{asset}_v{n}.mp4
//   Video composite:  {year}/{category}/{angle}/Video/composite/{variant}_9x16_v{n}.mp4
// {name} is the ad name when known (e.g. AD007_T05_A_pov_earnings_Static_9x16_list_now), otherwise
// {template}_{variant}_{format}. uploadCreativeAsset adds _v{n} so a new render never overwrites an old one.
// Older {year}/{month}/... and bases/ / renders/ paths stay readable (parseUnifiedPath handles both).

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
  /** Template id slug (e.g. split_header); goes into the file name when no ad name is given. */
  templateSlug?: string
  /** Ad / convention name; becomes the file name so files read like the namer. */
  name?: string
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

/** Keeps case (ad names are mixed case); drops anything unsafe for an object name. */
function fileStem(value: string): string {
  return value.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "")
}

function staticFileStem(args: UnifiedStaticPathArgs): string {
  if (args.name && fileStem(args.name)) return fileStem(args.name)
  const parts = [args.templateSlug ? slug(args.templateSlug) : "", args.variant, args.format].filter(Boolean)
  return parts.join("_")
}

function slug(value: string): string {
  return value.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase()
}

/** Unified static base photo path (pre-overlay). */
export function unifiedStaticBasePath(args: UnifiedStaticPathArgs): string {
  const ext = args.ext ?? "png"
  return `${yyyy(args.date)}/${slug(args.category)}/${slug(args.angleSlug)}/Static/base/base_${staticFileStem(args)}.${ext}`
}

/** Unified static output path. */
export function unifiedStaticPath(args: UnifiedStaticPathArgs): string {
  const ext = args.ext ?? "png"
  return `${yyyy(args.date)}/${slug(args.category)}/${slug(args.angleSlug)}/Static/composite/${staticFileStem(args)}.${ext}`
}

/** Unified video base path on creative bucket. */
export function unifiedVideoBasePath(args: UnifiedVideoBasePathArgs): string {
  const { date, category, angleSlug, assetSlug, source, version = 1, taskId } = args
  const prefix = `${yyyy(date)}/${slug(category)}/${slug(angleSlug)}/Video/base`
  if (source === "runway") {
    if (!taskId) throw new Error("taskId required for runway source")
    return `${prefix}/base_${slug(assetSlug)}_runway_${taskId}.mp4`
  }
  return `${prefix}/base_${slug(assetSlug)}_v${version}.mp4`
}

/** Unified composited video render path on creative bucket. */
export function unifiedVideoRenderPath(args: UnifiedVideoRenderPathArgs): string {
  const { date, category, angleSlug, variantSlug, templateVersion } = args
  return `${yyyy(date)}/${slug(category)}/${slug(angleSlug)}/Video/composite/${slug(variantSlug)}_9x16_v${templateVersion}.mp4`
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
  /** Only on older {year}/{month}/... paths. */
  month?: string
  category?: string
  angle?: string
  mediaType?: "Static" | "Video"
  /** base | composite when using split folders; undefined for legacy flat paths. */
  assetStage?: "base" | "composite"
  filename?: string
} | null {
  const parts = objectPath.replace(/^gs:\/\/[^/]+\//, "").split("/")
  if (!/^\d{4}$/.test(parts[0] ?? "")) return null
  const hasMonth = /^\d{2}$/.test(parts[1] ?? "")
  const o = hasMonth ? 1 : 0
  if (parts.length < 5 + o) return null
  const mediaType = parts[3 + o] === "Static" || parts[3 + o] === "Video" ? (parts[3 + o] as "Static" | "Video") : undefined
  if (!mediaType) return null

  const stageRaw = parts[4 + o]
  const stage = stageRaw === "base" || stageRaw === "composite" ? stageRaw : undefined

  return {
    year: parts[0],
    month: hasMonth ? parts[1] : undefined,
    category: parts[1 + o],
    angle: parts[2 + o],
    mediaType,
    assetStage: stage,
    filename: parts[parts.length - 1],
  }
}

/** Splits "dir/stem_v3.png" into its parts; version is null when the stem has no _v{n}. */
export function splitVersionedPath(objectPath: string) {
  const slash = objectPath.lastIndexOf("/")
  const dir = slash >= 0 ? objectPath.slice(0, slash + 1) : ""
  const file = objectPath.slice(slash + 1)
  const dot = file.lastIndexOf(".")
  const ext = dot > 0 ? file.slice(dot) : ""
  const stemWithVersion = dot > 0 ? file.slice(0, dot) : file
  const m = stemWithVersion.match(/^(.*)_v(\d+)$/)
  return {
    dir,
    stem: m ? m[1]! : stemWithVersion,
    version: m ? Number(m[2]) : null,
    ext,
  }
}

export function versionedPath(objectPath: string, version: number) {
  const { dir, stem, ext } = splitVersionedPath(objectPath)
  return `${dir}${stem}_v${version}${ext}`
}
