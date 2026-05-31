/** Client-safe SVG template constants and helpers (no Node/GCS imports). */

export type SvgAspectRatio = "1:1" | "4:5" | "9:16"
export type SvgStaticFormat = "1x1" | "4x5" | "9x16"

export type SvgTemplateId =
  | "thrml_split_header_static"
  | "thrml_block_split_static"
  /** Legacy layout — removed from intake; kept for existing brief regeneration. */
  | "thrml_pov_overlay_static"

export const SPLIT_HEADER_SVG_TEMPLATE_IDS = [
  "thrml_split_header_static",
  "thrml_block_split_static",
] as const satisfies readonly SvgTemplateId[]

export function isSplitHeaderSvgTemplate(templateId: string | null | undefined) {
  return SPLIT_HEADER_SVG_TEMPLATE_IDS.includes(templateId as (typeof SPLIT_HEADER_SVG_TEMPLATE_IDS)[number])
}

export const DEFAULT_HOST_HEADLINE = "Turn your idle sauna into income." as const

export const SPLIT_HEADER_DEFAULTS = {
  TAGLINE_EYEBROW: "PRIVATE WELLNESS, BY THE HOUR.",
  SUBHEAD: "Backyard and cabin saunas in Seattle + LA.",
  HEADLINE: DEFAULT_HOST_HEADLINE,
} as const

export function aspectRatioToFormat(aspectRatio: SvgAspectRatio): SvgStaticFormat {
  if (aspectRatio === "4:5") return "4x5"
  if (aspectRatio === "9:16") return "9x16"
  return "1x1"
}

export function formatToAspectRatio(format: SvgStaticFormat): SvgAspectRatio {
  if (format === "4x5") return "4:5"
  if (format === "9x16") return "9:16"
  return "1:1"
}

export function briefUsesSvgTemplate(triggerData: Record<string, unknown> | null | undefined) {
  return typeof triggerData?.svg_template_id === "string" && triggerData.svg_template_id.length > 0
}
