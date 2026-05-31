import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"
import yaml from "js-yaml"

import { resolveNamingFromBrief } from "@/lib/agent/creative-templates"
import { uploadCreativeAsset as uploadGcsCreativeAsset } from "@/lib/agent/gcs"
import { getSignedGcsReadUrl } from "@/lib/agent/gcs"
import { unifiedStaticPath } from "@/lib/agent/gcs-paths"
import {
  findHostClaimViolations,
  type HostClaimViolation,
} from "@/lib/listings/host-claim-policy"
import { buildAdName } from "@/lib/agent/naming-builder"
import {
  SPLIT_HEADER_DEFAULTS,
  aspectRatioToFormat,
  formatToAspectRatio,
  type SvgAspectRatio,
  type SvgStaticFormat,
} from "@/lib/agent/svg-template-shared"
export {
  SPLIT_HEADER_DEFAULTS,
  aspectRatioToFormat,
  briefUsesSvgTemplate,
  formatToAspectRatio,
  type SvgAspectRatio,
  type SvgStaticFormat,
  type SvgTemplateId,
} from "@/lib/agent/svg-template-shared"
import { injectBrandAdFonts } from "@/lib/agent/static-layouts/brand-ad-fonts"
import { createAdminClient } from "@/lib/supabase/admin"

export type SvgTemplateRegistryEntry = {
  id: SvgTemplateId
  label: string
  tokens: string[]
  aspect_ratios: SvgStaticFormat[]
}

type SvgTemplatesFile = {
  svg_templates?: SvgTemplateRegistryEntry[]
}

const VARIATION_LABELS = ["A", "B", "C"] as const

let registryCache: SvgTemplateRegistryEntry[] | null = null

function svgTemplatesPath() {
  return path.join(process.cwd(), "config", "creative-templates.yaml")
}

function svgFilePath(templateId: string, format: SvgStaticFormat) {
  return path.join(process.cwd(), "config", "creative-templates", "svg", `${templateId}_${format}.svg`)
}

export function loadSvgTemplateRegistry(): SvgTemplateRegistryEntry[] {
  if (registryCache) return registryCache
  const raw = fs.readFileSync(svgTemplatesPath(), "utf8")
  const parsed = yaml.load(raw) as SvgTemplatesFile
  registryCache = parsed.svg_templates ?? []
  return registryCache
}

export function getSvgTemplate(id: string): SvgTemplateRegistryEntry | undefined {
  return loadSvgTemplateRegistry().find((entry) => entry.id === id)
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

export function substituteSvgTokens(svg: string, tokens: Record<string, string>) {
  let result = svg
  for (const [key, rawValue] of Object.entries(tokens)) {
    const safe = escapeXml(rawValue ?? "")
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), safe)
  }
  return result
}

type SplitHeaderLayoutSpec = {
  padX: number
  headlineSize: number
  headlineLineHeight: number
  maxTextWidth: number
}

const SPLIT_HEADER_LAYOUT: Record<SvgStaticFormat, SplitHeaderLayoutSpec> = {
  "1x1": { padX: 72, headlineSize: 64, headlineLineHeight: 74, maxTextWidth: 820 },
  "4x5": { padX: 72, headlineSize: 72, headlineLineHeight: 82, maxTextWidth: 820 },
  "9x16": { padX: 80, headlineSize: 80, headlineLineHeight: 92, maxTextWidth: 800 },
}

function estimateTextWidth(value: string, fontSize: number) {
  return value.length * fontSize * 0.52
}

function wrapHeadlineLines(headline: string, fontSize: number, maxWidth: number, maxLines = 3) {
  const words = headline.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""

  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && estimateTextWidth(next, fontSize) > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
    if (lines.length >= maxLines) break
  }

  if (line && lines.length < maxLines) lines.push(line)
  return lines.length ? lines : [""]
}

function headlineToTspans(headline: string, spec: SplitHeaderLayoutSpec) {
  const lines = wrapHeadlineLines(headline, spec.headlineSize, spec.maxTextWidth)
  return lines
    .map(
      (text, index) =>
        `<tspan x="${spec.padX}" dy="${index === 0 ? 0 : spec.headlineLineHeight}">${escapeXml(text)}</tspan>`,
    )
    .join("")
}

export function renderPreparedSvg(rawSvg: string, preparedTokens: Record<string, string>) {
  const { HEADLINE_TSPANS, ...safeTokens } = preparedTokens
  let svg = substituteSvgTokens(rawSvg, safeTokens)
  if (HEADLINE_TSPANS) {
    svg = svg.replace(/\{\{HEADLINE_TSPANS\}\}/g, HEADLINE_TSPANS)
  }
  return svg
}

/** Normalize legacy split-header tokens and expand HEADLINE into wrapped tspans. */
export function prepareSplitHeaderTokens(format: SvgStaticFormat, tokens: Record<string, string>) {
  const resolved: Record<string, string> = {
    TAGLINE_EYEBROW:
      tokens.TAGLINE_EYEBROW?.trim() ||
      tokens.EYEBROW?.trim() ||
      SPLIT_HEADER_DEFAULTS.TAGLINE_EYEBROW,
    SUBHEAD:
      tokens.SUBHEAD?.trim() || tokens.FINEPRINT?.trim() || SPLIT_HEADER_DEFAULTS.SUBHEAD,
    HEADLINE:
      tokens.HEADLINE?.trim() ||
      [tokens.HEADLINE_L1, tokens.HEADLINE_L2].filter(Boolean).join(" ").trim(),
  }

  if (resolved.HEADLINE) {
    resolved.HEADLINE_TSPANS = headlineToTspans(resolved.HEADLINE, SPLIT_HEADER_LAYOUT[format])
  } else {
    resolved.HEADLINE_TSPANS = ""
  }

  return resolved
}

export function prepareSvgTokens(
  templateId: string,
  format: SvgStaticFormat,
  tokens: Record<string, string>,
) {
  if (templateId === "thrml_split_header_static") {
    return prepareSplitHeaderTokens(format, tokens)
  }
  return tokens
}

export async function renderSvgToPng(svg: string) {
  const withFonts = await injectBrandAdFonts(svg)
  return sharp(Buffer.from(withFonts)).png().toBuffer()
}

export function findAdCopyClaimViolations(tokens: Record<string, string>): HostClaimViolation[] {
  const seen = new Set<string>()
  const violations: HostClaimViolation[] = []

  for (const value of Object.values(tokens)) {
    if (!value?.trim()) continue
    for (const violation of findHostClaimViolations({ description: value })) {
      const key = `${violation.label}:${violation.matched}`
      if (seen.has(key)) continue
      seen.add(key)
      violations.push(violation)
    }
  }

  return violations
}

type BriefRow = {
  id: string
  trigger_data: Record<string, unknown> | null
  campaign_short_name: string | null
}

function taxonomyFromBrief(brief: BriefRow) {
  const td = brief.trigger_data ?? {}
  const category = typeof td.category === "string" ? td.category : "Hosts"
  const angleSlug =
    typeof td.angle === "string"
      ? td.angle
      : (brief.campaign_short_name ?? "general").replace(/-/g, "_")
  return { category, angleSlug }
}

function conventionNameForSvgStatic(
  brief: BriefRow,
  format: SvgStaticFormat,
  variationLabel: string,
): string | null {
  const naming = resolveNamingFromBrief(brief)
  if (!naming) return null
  const formatToken = naming.format.includes("Static") ? `Static_${format}` : naming.format
  try {
    return buildAdName({
      testId: naming.test_id,
      variant: variationLabel.toUpperCase().slice(0, 1) as "A" | "B" | "C" | "D",
      angle: typeof brief.trigger_data?.angle === "string" ? brief.trigger_data.angle : "pov_earnings",
      format: formatToken,
      cta: naming.cta,
    })
  } catch {
    return null
  }
}

export type StoredSvgVariation = {
  variation_label: string
  tokens: Record<string, string>
  photo_gcs_path?: string | null
}

export function parseStoredSvgVariations(triggerData: Record<string, unknown> | null | undefined) {
  const raw = triggerData?.svg_variations
  if (!Array.isArray(raw)) return null
  const parsed: StoredSvgVariation[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const tokens = row.tokens
    if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) continue
    parsed.push({
      variation_label: typeof row.variation_label === "string" ? row.variation_label : "A",
      tokens: Object.fromEntries(
        Object.entries(tokens as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
      photo_gcs_path: typeof row.photo_gcs_path === "string" ? row.photo_gcs_path : null,
    })
  }
  return parsed.length ? parsed : null
}

export async function applyClaimWarningToBrief(
  admin: ReturnType<typeof createAdminClient>,
  briefId: string,
  violations: HostClaimViolation[],
) {
  if (!violations.length) return

  const { data: brief } = await admin.from("creative_briefs").select("trigger_data").eq("id", briefId).maybeSingle()
  const td = (brief?.trigger_data as Record<string, unknown> | null) ?? {}

  await admin
    .from("creative_briefs")
    .update({
      trigger_data: {
        ...td,
        claim_warning: {
          violations,
          detected_at: new Date().toISOString(),
          requires_launch_acknowledgement: true,
        },
      },
    })
    .eq("id", briefId)
}

export type GenerateFromSvgTemplateResult = {
  assetId: string
  gcsPath: string
  gcsUrl: string
  conventionName: string | null
  format: SvgStaticFormat
  claimViolations: HostClaimViolation[]
}

export async function generateFromSvgTemplate(
  briefId: string,
  templateId: string,
  aspectRatio: SvgAspectRatio,
  tokens: Record<string, string>,
  photoGcsPath?: string | null,
  opts?: { variationLabel?: string; variationIndex?: number },
): Promise<GenerateFromSvgTemplateResult> {
  const admin = createAdminClient()
  const template = getSvgTemplate(templateId)
  if (!template) throw new Error(`Unknown SVG template: ${templateId}`)

  const format = aspectRatioToFormat(aspectRatio)
  if (!template.aspect_ratios.includes(format)) {
    throw new Error(`Template ${templateId} does not support format ${format}`)
  }

  const filePath = svgFilePath(templateId, format)
  if (!fs.existsSync(filePath)) {
    throw new Error(`SVG template file not found: ${filePath}`)
  }

  const { data: brief, error: briefError } = await admin
    .from("creative_briefs")
    .select("id, trigger_data, campaign_short_name")
    .eq("id", briefId)
    .maybeSingle()

  if (briefError) throw briefError
  if (!brief) throw new Error("Creative brief not found")

  const resolvedTokens = { ...tokens }
  if (photoGcsPath?.trim()) {
    const signedUrl = await getSignedGcsReadUrl(photoGcsPath.trim(), { expiresInSec: 3600 })
    resolvedTokens.PHOTO_URL = signedUrl
  }

  const claimViolations = findAdCopyClaimViolations(resolvedTokens)
  if (claimViolations.length) {
    await applyClaimWarningToBrief(admin, briefId, claimViolations)
  }

  const rawSvg = fs.readFileSync(filePath, "utf8")
  const preparedTokens = prepareSvgTokens(templateId, format, resolvedTokens)
  const svgString = renderPreparedSvg(rawSvg, preparedTokens)
  const pngBuffer = await renderSvgToPng(svgString)

  const variationLabel = (opts?.variationLabel ?? "A").toUpperCase().slice(0, 1)
  const variationIndex = opts?.variationIndex ?? 1
  const { category, angleSlug } = taxonomyFromBrief(brief as BriefRow)
  const conventionName = conventionNameForSvgStatic(brief as BriefRow, format, variationLabel)
  const unifiedPath = unifiedStaticPath({
    date: new Date(),
    category,
    angleSlug,
    variant: variationLabel,
    format,
  })

  const { gcsPath, gcsUrl } = await uploadGcsCreativeAsset(pngBuffer, {
    campaignShortName: brief.campaign_short_name ?? briefId,
    briefId,
    kind: "static",
    filename: `svg_${format}_${variationLabel}.png`,
    contentType: "image/png",
    unifiedObjectPath: unifiedPath,
  })

  const { data: asset, error: insertError } = await admin
    .from("creative_assets")
    .insert({
      brief_id: briefId,
      asset_type: "image",
      generation_tool: "svg_template",
      variation_index: variationIndex,
      variation_label: variationLabel,
      format,
      gcs_path: gcsPath,
      gcs_url: gcsUrl,
      convention_name: conventionName,
      status: "generated",
      performance_data: {
        svg_template_id: templateId,
        svg_tokens: resolvedTokens,
        photo_gcs_path: photoGcsPath ?? null,
        claim_violations: claimViolations.length ? claimViolations : null,
      },
    })
    .select("id")
    .maybeSingle()

  if (insertError) throw insertError
  if (!asset?.id) throw new Error("Failed to insert creative_assets row")

  return {
    assetId: asset.id,
    gcsPath,
    gcsUrl,
    conventionName,
    format,
    claimViolations,
  }
}

export async function generateSvgVariantsForBrief(
  briefId: string,
  opts?: { formats?: SvgStaticFormat[]; variations?: number },
) {
  const admin = createAdminClient()
  const { data: brief, error } = await admin
    .from("creative_briefs")
    .select("id, trigger_data, format, success_criteria")
    .eq("id", briefId)
    .maybeSingle()

  if (error) throw error
  if (!brief) throw new Error("Creative brief not found")

  const td = (brief.trigger_data as Record<string, unknown> | null) ?? {}
  const templateId = typeof td.svg_template_id === "string" ? td.svg_template_id : null
  if (!templateId) throw new Error("Brief is missing trigger_data.svg_template_id")

  const baseTokens =
    td.svg_tokens && typeof td.svg_tokens === "object" && !Array.isArray(td.svg_tokens)
      ? (td.svg_tokens as Record<string, string>)
      : {}

  const photoGcsPath = typeof td.photo_gcs_path === "string" ? td.photo_gcs_path : null
  const storedVariations = parseStoredSvgVariations(td)
  const variationLimit = Math.min(Math.max(opts?.variations ?? 3, 1), 3)
  const variations = (storedVariations?.length ? storedVariations : [{ variation_label: "A", tokens: baseTokens, photo_gcs_path: photoGcsPath }]).slice(
    0,
    variationLimit,
  )

  const requestedFormats = opts?.formats?.length
    ? opts.formats
    : (typeof brief.format === "string"
        ? brief.format.split(/[,/+\s]+/).filter((f): f is SvgStaticFormat => f === "1x1" || f === "4x5" || f === "9x16")
        : ["1x1"])

  const formats: SvgStaticFormat[] = Array.from(new Set(requestedFormats))
    .filter((f): f is SvgStaticFormat => f === "1x1" || f === "4x5" || f === "9x16")
    .slice(0, 3)
  const results: GenerateFromSvgTemplateResult[] = []

  for (const [i, variation] of variations.entries()) {
    const mergedTokens = { ...baseTokens, ...variation.tokens }
    const photo = variation.photo_gcs_path ?? photoGcsPath

    for (const format of formats) {
      const result = await generateFromSvgTemplate(
        briefId,
        templateId,
        formatToAspectRatio(format),
        mergedTokens,
        photo,
        {
          variationLabel: variation.variation_label || VARIATION_LABELS[i] || "A",
          variationIndex: i + 1,
        },
      )
      results.push(result)
    }
  }

  return results
}
