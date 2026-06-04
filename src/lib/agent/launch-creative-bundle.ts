import { normalizeStaticFormat, type StaticFormat } from "@/lib/agent/static-brief-plan"

export type LaunchableAssetRow = {
  id: string
  brief_id: string | null
  asset_type: string | null
  generation_tool: string | null
  variation_label: string | null
  format: string | null
  status: string | null
  meta_ad_id: string | null
}

/** Normalize pipeline/UI asset rows for bundle validation. */
export function toLaunchableAssetRow(asset: {
  id: string
  brief_id?: string | null
  asset_type?: string | null
  generation_tool?: string | null
  variation_label?: string | null
  format?: string | null
  status?: string | null
  meta_ad_id?: string | null
}): LaunchableAssetRow {
  return {
    id: asset.id,
    brief_id: asset.brief_id ?? null,
    asset_type: asset.asset_type ?? null,
    generation_tool: asset.generation_tool ?? null,
    variation_label: asset.variation_label ?? null,
    format: asset.format ?? null,
    status: asset.status ?? null,
    meta_ad_id: asset.meta_ad_id ?? null,
  }
}

const VIDEO_LAUNCH_TOOLS = new Set(["composite-video"])
const BASE_VIDEO_TOOLS = new Set(["runway", "manual"])

export function isLaunchableStaticImage(asset: LaunchableAssetRow): boolean {
  const tool = asset.generation_tool ?? ""
  if (VIDEO_LAUNCH_TOOLS.has(tool) || BASE_VIDEO_TOOLS.has(tool)) return false
  return asset.asset_type === "image"
}

export function placementBundleFormats(assets: LaunchableAssetRow[]): StaticFormat[] {
  return assets
    .map((asset) => normalizeStaticFormat(asset.format))
    .filter((value): value is StaticFormat => Boolean(value))
}

/** Best set of approved, unlaunched static assets for one placement-bundle ad (same brief + variation). */
export function selectPlacementBundleAssets(
  assets: LaunchableAssetRow[]
): LaunchableAssetRow[] {
  const eligible = assets.filter(
    (asset) =>
      isLaunchableStaticImage(asset) &&
      asset.status === "approved" &&
      !asset.meta_ad_id &&
      asset.brief_id
  )
  if (eligible.length < 2) return []

  const byBriefVariation = new Map<string, LaunchableAssetRow[]>()
  for (const asset of eligible) {
    const label = (asset.variation_label ?? "A").toUpperCase().slice(0, 1)
    const key = `${asset.brief_id}:${label}`
    const list = byBriefVariation.get(key) ?? []
    list.push(asset)
    byBriefVariation.set(key, list)
  }

  let best: LaunchableAssetRow[] = []
  for (const group of byBriefVariation.values()) {
    const formats = placementBundleFormats(group)
    if (formats.length !== group.length) continue
    if (new Set(formats).size !== formats.length) continue
    if (group.length > best.length) best = group
  }
  return best
}

export function canLaunchAsPlacementBundle(assets: LaunchableAssetRow[]): boolean {
  if (assets.length < 2) return false
  if (!assets.every(isLaunchableStaticImage)) return false
  if (!assets.every((asset) => asset.status === "approved")) return false
  if (assets.some((asset) => asset.meta_ad_id)) return false

  const briefIds = new Set(assets.map((asset) => asset.brief_id).filter(Boolean))
  if (briefIds.size !== 1) return false

  const variationLabels = new Set(
    assets.map((asset) => (asset.variation_label ?? "A").toUpperCase().slice(0, 1))
  )
  if (variationLabels.size !== 1) return false

  const formats = placementBundleFormats(assets)
  return formats.length === assets.length && new Set(formats).size === formats.length
}

export function validatePlacementBundle(assets: LaunchableAssetRow[]): string | null {
  if (assets.length < 2) return "Select at least two approved static assets to launch as one ad."
  if (!assets.every(isLaunchableStaticImage)) {
    return "Placement bundle only supports static images (not video)."
  }
  if (!assets.every((asset) => asset.status === "approved")) {
    return "All selected assets must be approved before launch."
  }
  const launched = assets.filter((asset) => asset.meta_ad_id)
  if (launched.length > 0) {
    return "One or more selected assets are already launched. Deselect launched sizes."
  }
  const briefIds = new Set(assets.map((asset) => asset.brief_id).filter(Boolean))
  if (briefIds.size !== 1) return "All assets must belong to the same brief."
  const variationLabels = new Set(
    assets.map((asset) => (asset.variation_label ?? "A").toUpperCase().slice(0, 1))
  )
  if (variationLabels.size !== 1) {
    return "All assets must share the same variation (A, B, or C)."
  }
  const formats = placementBundleFormats(assets)
  if (formats.length !== assets.length) {
    return "Each asset must have a recognized format (1x1, 4x5, or 9x16)."
  }
  if (new Set(formats).size !== formats.length) {
    return "Select only one asset per format (no duplicate 1x1 / 4x5 / 9x16)."
  }
  return null
}
