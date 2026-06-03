const HOST_LANDING = "https://usethrml.com/become-a-host"
const DEFAULT_LANDING = "https://usethrml.com"

/** Destination URL for link / CTA — host creatives should land on become-a-host. */
export function resolveLaunchLandingUrl(brief: {
  trigger_data?: Record<string, unknown> | null
}): string {
  const td = brief.trigger_data ?? {}
  const category = typeof td.category === "string" ? td.category.trim().toLowerCase() : ""
  if (category === "hosts") return HOST_LANDING
  return DEFAULT_LANDING
}

export type LaunchPreflightWarning = {
  field: string
  message: string
}

/** Soft checks before Meta API — does not block launch. */
export function collectLaunchPreflightWarnings(
  brief: {
    copy_primary?: string | null
    copy_headline?: string | null
    copy_subtext?: string | null
    cta?: string | null
    trigger_data?: Record<string, unknown> | null
  },
  opts?: { isVideo?: boolean }
): LaunchPreflightWarning[] {
  const warnings: LaunchPreflightWarning[] = []
  const primary = brief.copy_primary?.trim() ?? ""
  const headline = brief.copy_headline?.trim() ?? ""
  const subtext = brief.copy_subtext?.trim() ?? ""

  if (!primary && !opts?.isVideo) {
    warnings.push({ field: "copy_primary", message: "Primary text is empty." })
  }
  if (!headline && !opts?.isVideo) {
    warnings.push({ field: "copy_headline", message: "Headline is empty." })
  }
  if (primary.length > 125) {
    warnings.push({
      field: "copy_primary",
      message: `Primary text is ${primary.length} chars; Meta often truncates above ~125.`,
    })
  }
  if (headline.length > 40) {
    warnings.push({
      field: "copy_headline",
      message: `Headline is ${headline.length} chars; may truncate in feed placements.`,
    })
  }
  if (subtext.length > 30) {
    warnings.push({
      field: "copy_subtext",
      message: `Description is ${subtext.length} chars; link description limit is often ~30.`,
    })
  }

  const claimWarning = brief.trigger_data?.claim_warning
  if (
    claimWarning &&
    typeof claimWarning === "object" &&
    !Array.isArray(claimWarning) &&
    !(claimWarning as Record<string, unknown>).acknowledged_at
  ) {
    warnings.push({
      field: "claim_warning",
      message: "Health-claim flag not acknowledged on brief.",
    })
  }

  return warnings
}
