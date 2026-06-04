import { HOST_PROOF_SUBTEXT } from "@/lib/agent/host-monetization-static"
import { DEFAULT_HOST_HEADLINE, SPLIT_HEADER_DEFAULTS } from "@/lib/agent/svg-template-shared"

const DEFAULT_HOST_PRIMARY =
  "List your private sauna on thrml and earn when you're not using it."

const DEFAULT_HOST_CTA = "List Your Space"

export type BriefCopyFields = {
  copy_primary: string
  copy_headline: string
  copy_subtext: string
  cta: string
}

type BriefLike = {
  hook?: string | null
  copy_primary?: string | null
  copy_headline?: string | null
  copy_subtext?: string | null
  cta?: string | null
  trigger_data?: Record<string, unknown> | null
}

function svgTokensFromBrief(triggerData: Record<string, unknown> | null | undefined) {
  const td = triggerData ?? {}
  const direct =
    td.svg_tokens && typeof td.svg_tokens === "object" && !Array.isArray(td.svg_tokens)
      ? (td.svg_tokens as Record<string, unknown>)
      : {}

  const vars = Array.isArray(td.svg_variations) ? td.svg_variations : []
  const first = vars[0]
  const fromVar =
    first && typeof first === "object"
      ? (first as { tokens?: Record<string, unknown> }).tokens ?? {}
      : {}

  return { ...direct, ...fromVar }
}

function headlineFromSvgAndBrief(brief: BriefLike): string {
  if (brief.copy_headline?.trim()) return brief.copy_headline.trim()

  const tokens = svgTokensFromBrief(brief.trigger_data)
  if (typeof tokens.HEADLINE === "string" && tokens.HEADLINE.trim()) {
    return tokens.HEADLINE.trim()
  }

  const line1 = typeof tokens.POV_LINE_1 === "string" ? tokens.POV_LINE_1.trim() : ""
  const line2 = typeof tokens.POV_LINE_2 === "string" ? tokens.POV_LINE_2.trim() : ""
  if (line1 || line2) return [line1, line2].filter(Boolean).join(" ")

  const staticVars = brief.trigger_data?.static_variations
  if (Array.isArray(staticVars) && staticVars.length) {
    const first = staticVars[0]
    if (first && typeof first === "object") {
      const headline = (first as Record<string, unknown>).headline
      if (typeof headline === "string" && headline.trim()) return headline.trim()
    }
  }

  if (brief.hook?.trim() && !brief.hook.trim().toLowerCase().includes("block split")) {
    return brief.hook.trim()
  }

  return DEFAULT_HOST_HEADLINE
}

function subtextFromBrief(brief: BriefLike): string {
  if (brief.copy_subtext?.trim()) return brief.copy_subtext.trim()

  const tokens = svgTokensFromBrief(brief.trigger_data)
  if (typeof tokens.SUBHEAD === "string" && tokens.SUBHEAD.trim()) {
    return tokens.SUBHEAD.trim()
  }

  return HOST_PROOF_SUBTEXT
}

function ctaFromBrief(brief: BriefLike): string {
  if (brief.cta?.trim()) return brief.cta.trim()

  const naming = brief.trigger_data?.naming
  if (naming && typeof naming === "object" && !Array.isArray(naming)) {
    const token = (naming as { cta?: unknown }).cta
    if (token === "list_now") return DEFAULT_HOST_CTA
    if (typeof token === "string" && token.trim()) return token.trim()
  }

  return DEFAULT_HOST_CTA
}

export function hasResolvableLaunchCopy(brief: BriefLike): boolean {
  const resolved = resolveBriefCopyForMeta(brief)
  return Boolean(resolved.copy_primary.trim() && resolved.copy_headline.trim())
}

/** Resolve Meta + launch copy from brief columns and SVG/static tokens. */
export function resolveBriefCopyForMeta(brief: BriefLike): BriefCopyFields {
  const copy_headline = headlineFromSvgAndBrief(brief)
  const copy_subtext = subtextFromBrief(brief)
  const cta = ctaFromBrief(brief)
  const copy_primary = brief.copy_primary?.trim() || DEFAULT_HOST_PRIMARY

  return { copy_primary, copy_headline, copy_subtext, cta }
}

/** Defaults when creating SVG template briefs in the DB. */
export function defaultHostBriefCopyFromSvgTokens(
  svgTokens: Record<string, string>,
  opts?: { hook?: string | null }
): BriefCopyFields {
  const headline =
    svgTokens.HEADLINE?.trim() ||
    [svgTokens.POV_LINE_1, svgTokens.POV_LINE_2].filter(Boolean).join(" ").trim() ||
    opts?.hook?.trim() ||
    DEFAULT_HOST_HEADLINE

  return {
    copy_headline: headline,
    copy_primary: DEFAULT_HOST_PRIMARY,
    copy_subtext: svgTokens.SUBHEAD?.trim() || SPLIT_HEADER_DEFAULTS.SUBHEAD,
    cta: DEFAULT_HOST_CTA,
  }
}
