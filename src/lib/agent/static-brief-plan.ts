export type StaticFormat = "1x1" | "4x5" | "9x16"

/** Minimum deliverable sizes for T1 / photo+Master Ad concept-verify workflows. */
export const STANDARD_PHOTO_STATIC_FORMATS: StaticFormat[] = ["1x1", "9x16", "4x5"]

export function normalizeStaticFormat(value: unknown): StaticFormat | null {
  return value === "1x1" || value === "4x5" || value === "9x16" ? value : null
}

export function isConceptVerifyBrief(brief: {
  trigger_data?: Record<string, unknown> | null
  success_criteria?: Record<string, unknown> | null
}): boolean {
  const td = brief.trigger_data ?? {}
  const sc = brief.success_criteria
  if (td.concept_verify === true) return true
  if (sc && typeof sc === "object" && !Array.isArray(sc) && sc.concept_verify === true) return true
  return false
}

function isSvgStaticBrief(brief: { trigger_data?: Record<string, unknown> | null }): boolean {
  const td = brief.trigger_data ?? {}
  if (typeof td.svg_template_id === "string" && td.svg_template_id.trim()) return true
  return td.generation_tool === "svg_template"
}

function mergePhotoStaticTargetFormats(
  brief: { trigger_data?: Record<string, unknown> | null },
  formats: StaticFormat[],
): StaticFormat[] {
  if (isSvgStaticBrief(brief)) return formats
  return Array.from(new Set([...formats, ...STANDARD_PHOTO_STATIC_FORMATS]))
}

export function targetFormatsForBrief(brief: {
  format?: string | null
  success_criteria?: Record<string, unknown> | null
  trigger_data?: Record<string, unknown> | null
}): StaticFormat[] {
  const sc = brief.success_criteria
  const fromSc =
    sc && typeof sc === "object" && !Array.isArray(sc) && Array.isArray(sc.formats)
      ? sc.formats.map(normalizeStaticFormat).filter((value): value is StaticFormat => Boolean(value))
      : []

  if (fromSc.length) return mergePhotoStaticTargetFormats(brief, Array.from(new Set(fromSc)))

  if (typeof brief.format !== "string") return mergePhotoStaticTargetFormats(brief, ["1x1"])
  const formats = new Set<StaticFormat>()
  for (const value of brief.format.split(/[,/+\s]+/)) {
    const normalized = normalizeStaticFormat(value)
    if (normalized) formats.add(normalized)
  }
  const resolved = formats.size > 0 ? Array.from(formats) : ["1x1"]
  return mergePhotoStaticTargetFormats(brief, resolved)
}

export function previewFormatForBrief(brief: {
  format?: string | null
  success_criteria?: Record<string, unknown> | null
}): StaticFormat {
  const sc = brief.success_criteria
  const fromSc =
    sc && typeof sc === "object" && !Array.isArray(sc) ? normalizeStaticFormat(sc.preview_format) : null
  if (fromSc) return fromSc
  return targetFormatsForBrief(brief)[0] ?? "1x1"
}

export function missingFormatsForVariation(
  briefFormats: StaticFormat[],
  existingAssets: Array<{ format?: string | null; variation_label?: string | null }>,
  variationLabel: string,
): StaticFormat[] {
  const label = variationLabel.toUpperCase().slice(0, 1)
  const existing = new Set(
    existingAssets
      .filter((asset) => (asset.variation_label ?? "A").toUpperCase().slice(0, 1) === label)
      .map((asset) => asset.format)
      .filter((value): value is StaticFormat => normalizeStaticFormat(value) !== null),
  )
  return briefFormats.filter((format) => !existing.has(format))
}

export function buildOutFormatsForAsset(
  brief: {
    format?: string | null
    success_criteria?: Record<string, unknown> | null
    trigger_data?: Record<string, unknown> | null
  },
  asset: { format?: string | null; variation_label?: string | null },
  assets: Array<{ format?: string | null; variation_label?: string | null }>,
): StaticFormat[] {
  const variationLabel = (asset.variation_label ?? "A").toUpperCase().slice(0, 1)
  return missingFormatsForVariation(targetFormatsForBrief(brief), assets, variationLabel).filter(
    (format) => format !== normalizeStaticFormat(asset.format),
  )
}

export function nextVariationLabelsForBrief(
  brief: { format?: string | null; success_criteria?: Record<string, unknown> | null; trigger_data?: Record<string, unknown> | null },
  assets: Array<{ format?: string | null; variation_label?: string | null }>,
  planLabels?: string[],
): Array<"A" | "B" | "C"> {
  const labels = planLabels?.length ? planLabels.map((label) => label.toUpperCase().slice(0, 1)) : ["A", "B", "C"]
  const preview = previewFormatForBrief(brief)

  return labels.filter((label): label is "A" | "B" | "C" => {
    if (label !== "A" && label !== "B" && label !== "C") return false
    return !assets.some(
      (asset) =>
        (asset.variation_label ?? "A").toUpperCase().slice(0, 1) === label &&
        normalizeStaticFormat(asset.format) === preview,
    )
  })
}
