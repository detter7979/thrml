// Path builder utilities for thrml creative GCS bucket.
// All paths use the new bases/renders structure with year/month/concept partitioning.

export const BUCKET_NAME = process.env.GCS_CREATIVE_BUCKET ?? "thrml-creative"

export interface BasePathArgs {
  date: Date
  conceptSlug: string
  assetSlug: string
  source: "uploaded" | "runway"
  version?: number // for uploaded: v1, v2 (default 1)
  taskId?: string // for runway: required
}

export interface RenderPathArgs {
  date: Date
  conceptSlug: string
  variantSlug: string
  templateVersion: number // default 1
}

function yyyy(d: Date): string {
  return d.getUTCFullYear().toString()
}

function mm(d: Date): string {
  return (d.getUTCMonth() + 1).toString().padStart(2, "0")
}

/**
 * Build the GCS object path for a base video (raw input).
 * Examples:
 *   bases/2026/05/sauna-pov-earnings/sauna_v1.mp4
 *   bases/2026/05/sauna-pov-earnings/sauna_runway_a1b2c3d4.mp4
 */
export function baseVideoPath(args: BasePathArgs): string {
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
 * Example: renders/2026/05/sauna-pov-earnings/pov-earn-1000_v1.mp4
 */
export function renderedVideoPath(args: RenderPathArgs): string {
  const { date, conceptSlug, variantSlug, templateVersion = 1 } = args
  return `renders/${yyyy(date)}/${mm(date)}/${conceptSlug}/${variantSlug}_v${templateVersion}.mp4`
}

/**
 * Build the full gs:// URL from an object path.
 */
export function gcsUrl(objectPath: string): string {
  return `gs://${BUCKET_NAME}/${objectPath}`
}

/**
 * Build the public HTTPS URL for a GCS object (for signed URLs use the existing gcs.ts helper).
 */
export function gcsPublicUrl(objectPath: string): string {
  return `https://storage.googleapis.com/${BUCKET_NAME}/${objectPath}`
}
