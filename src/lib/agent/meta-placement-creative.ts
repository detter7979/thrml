import type { StaticFormat } from "@/lib/agent/static-brief-plan"
import { ctaToMetaEnumFromBrief } from "@/lib/agent/meta-cta"

export type PlacementImageInput = {
  format: StaticFormat
  imageHash: string
}

const FORMAT_LABEL: Record<StaticFormat, string> = {
  "1x1": "thrml_square",
  "4x5": "thrml_portrait",
  "9x16": "thrml_story",
}

/** Placement targeting per aspect ratio — positions must match Meta Marketing API enums. */
const FORMAT_RULE_SPEC: Record<
  StaticFormat,
  {
    facebook_positions: string[]
    instagram_positions: string[]
  }
> = {
  "1x1": {
    facebook_positions: ["feed", "right_hand_column", "marketplace"],
    instagram_positions: ["stream", "explore", "profile_feed"],
  },
  "4x5": {
    facebook_positions: ["feed", "marketplace"],
    instagram_positions: ["stream", "explore", "profile_feed"],
  },
  "9x16": {
    facebook_positions: ["story", "video_feeds"],
    instagram_positions: ["story", "explore", "ig_search"],
  },
}

function customizationSpecFor(format: StaticFormat, includeInstagram: boolean) {
  const rule = FORMAT_RULE_SPEC[format]
  if (includeInstagram) {
    return {
      publisher_platforms: ["facebook", "instagram"],
      facebook_positions: rule.facebook_positions,
      instagram_positions: rule.instagram_positions,
    }
  }
  return {
    publisher_platforms: ["facebook"],
    facebook_positions: rule.facebook_positions,
  }
}

const FORMAT_PRIORITY: StaticFormat[] = ["1x1", "4x5", "9x16"]

export function labelForPlacementFormat(format: StaticFormat): string {
  return FORMAT_LABEL[format]
}

export function sortPlacementFormats(formats: StaticFormat[]): StaticFormat[] {
  return [...formats].sort(
    (a, b) => FORMAT_PRIORITY.indexOf(a) - FORMAT_PRIORITY.indexOf(b)
  )
}

export function buildPlacementAssetFeedSpec(params: {
  images: PlacementImageInput[]
  landingUrl: string
  primaryCopy: string
  headline: string
  description: string
  brief: {
    cta?: string | null
    trigger_data?: Record<string, unknown> | null
  }
  /** When false, rules target Facebook only (no META_INSTAGRAM_ACCOUNT_ID). */
  includeInstagram?: boolean
}) {
  const includeInstagram = params.includeInstagram !== false
  const sorted = sortPlacementFormats(params.images.map((row) => row.format))
  const imageByFormat = new Map(params.images.map((row) => [row.format, row.imageHash]))
  const defaultFormat = sorted.includes("1x1") ? "1x1" : sorted[0]
  const ctaType = ctaToMetaEnumFromBrief(params.brief)

  const images = sorted.map((format) => ({
    hash: imageByFormat.get(format)!,
    adlabels: [{ name: labelForPlacementFormat(format) }],
  }))

  const assetCustomizationRules: Record<string, unknown>[] = [
    {
      is_default: true,
      customization_spec: {},
      image_label: { name: labelForPlacementFormat(defaultFormat) },
    },
  ]

  for (const format of sorted) {
    if (format === defaultFormat) continue
    assetCustomizationRules.push({
      customization_spec: customizationSpecFor(format, includeInstagram),
      image_label: { name: labelForPlacementFormat(format) },
    })
  }

  if (assetCustomizationRules.length < 2) {
    const only = sorted[0]
    assetCustomizationRules.push({
      customization_spec: customizationSpecFor(only, includeInstagram),
      image_label: { name: labelForPlacementFormat(only) },
    })
  }

  return {
    images,
    bodies: [{ text: params.primaryCopy }],
    titles: [{ text: params.headline }],
    descriptions: [{ text: params.description }],
    link_urls: [{ website_url: params.landingUrl }],
    call_to_action_types: [ctaType],
    ad_formats: ["SINGLE_IMAGE"],
    optimization_type: "PLACEMENT",
    asset_customization_rules: assetCustomizationRules,
  }
}

export function resolvePlacementBundleAdName(
  conventionNames: Array<string | null | undefined>,
  fallback: string
): string {
  for (const raw of conventionNames) {
    const name = raw?.trim()
    if (!name) continue
    const stripped = name.replace(/_Static_(1x1|4x5|9x16)$/i, "")
    if (stripped.length > 0) return `${stripped}_placements`
  }
  return `${fallback}_placements`
}
