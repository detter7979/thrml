/**
 * Helpers for reusing one image across copy sets: merging editor saves into
 * existing trigger_data, and duplicating a brief as a new copy set.
 */

/** Per-run / per-launch keys that must not carry over to a duplicated brief. */
const NON_COPYABLE_TRIGGER_KEYS = ["claim_warning", "meta_ad_id", "meta_creative_id", "published"] as const

/**
 * Shallow-merge an editor patch into stored trigger_data. Keys the editor does not manage
 * (template_id, category, …) survive; a key explicitly set to null is removed.
 */
export function mergeBriefTriggerData(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(existing ?? {}) }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key]
    else merged[key] = value
  }
  return merged
}

/** Build the insert row for a new copy set: same template, photo, sizes and naming; fresh status. */
export function duplicateBriefRow(source: Record<string, unknown>): Record<string, unknown> {
  const td =
    source.trigger_data && typeof source.trigger_data === "object" && !Array.isArray(source.trigger_data)
      ? { ...(source.trigger_data as Record<string, unknown>) }
      : {}
  for (const key of NON_COPYABLE_TRIGGER_KEYS) delete td[key]

  const copyFields = [
    "trigger_type",
    "hook",
    "format",
    "visual_direction",
    "copy_primary",
    "copy_headline",
    "copy_subtext",
    "cta",
    "target_audience",
    "reference_image_urls",
    "rationale",
    "video_config",
    "hypothesis",
    "campaign_short_name",
    "success_criteria",
  ] as const

  const row: Record<string, unknown> = {}
  for (const field of copyFields) {
    if (source[field] !== undefined) row[field] = source[field]
  }

  return {
    ...row,
    trigger_data: td,
    status: "briefed",
    approved_at: null,
    rejected_at: null,
    published_at: null,
    publish_platform_id: null,
    parent_brief_id: source.id ?? null,
    version: 1,
    created_by: "admin",
  }
}

export type SvgCopyRow = {
  variation_label: string
  headline: string
  /** Blank = use the brief's shared eyebrow. */
  eyebrow: string
  /** Blank = use the brief's shared subhead. */
  subhead: string
}

/** Resolve one copy row into SVG tokens, falling back to the shared eyebrow/subhead. */
export function svgTokensForCopyRow(
  row: SvgCopyRow,
  shared: { eyebrow: string; subhead: string },
): Record<string, string> {
  return {
    TAGLINE_EYEBROW: row.eyebrow.trim() || shared.eyebrow.trim(),
    SUBHEAD: row.subhead.trim() || shared.subhead.trim(),
    HEADLINE: row.headline.trim(),
  }
}
