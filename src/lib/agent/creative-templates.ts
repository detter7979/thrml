import fs from "node:fs"
import path from "node:path"

import yaml from "js-yaml"

import { HOST_MONETIZATION_CANONICAL_VARIATIONS } from "@/lib/agent/host-monetization-static"
import type { VideoConfig, VideoCopyVariant } from "@/lib/agent/types"

export type CreativeTemplateType = "static" | "video"

export type CreativeTemplateNaming = {
  test_id: string
  format: string
  cta: string
  /** Snake_case layout id for future namer extensions (e.g. split_header, block_split). */
  template_slug?: string
}

export type CreativeTemplateGroup = "static_photo" | "static_svg" | "video_pov"

export type CreativeTemplateStaticVariation = {
  variation_label: string
  headline: string
  background_image_prompt: string
}

export type CreativeTemplateSvgVariation = {
  variation_label: string
  tokens: Record<string, string>
  photo_gcs_path?: string
}

export type CreativeTemplateVideoBlock = {
  source: "runway" | "uploaded"
  concept_slug: string
  asset_slug: string
  template_version: number
  duration?: 5 | 10
  ratio?: "720:1280" | "1280:720" | "768:1280" | "1280:768"
  runway_prompt?: string
  copy_variants: Array<{
    slug: string
    copy: string
    variant?: "A" | "B" | "C" | "D"
  }>
}

export type CreativeTemplate = {
  id: string
  label: string
  short_label?: string
  description?: string
  group?: CreativeTemplateGroup
  recommended?: boolean
  type: CreativeTemplateType
  category: string
  angle: string
  formats: string[]
  default_variations: 1 | 2 | 3
  concept_verify_default: boolean
  full_batch_variations: 1 | 2 | 3
  static_playbook?: string
  generation_tool?: "svg_template" | "imagen" | "replicate" | "both"
  svg_template_id?: string
  svg_tokens?: Record<string, string>
  naming: CreativeTemplateNaming
  defaults: Record<string, string>
  static_variations?: CreativeTemplateStaticVariation[]
  svg_variations?: CreativeTemplateSvgVariation[]
  video?: CreativeTemplateVideoBlock
}

type TemplatesFile = {
  version: number
  templates: CreativeTemplate[]
}

let cached: CreativeTemplate[] | null = null

function templatesPath() {
  return path.join(process.cwd(), "config", "creative-templates.yaml")
}

export function loadCreativeTemplates(): CreativeTemplate[] {
  if (cached) return cached
  const raw = fs.readFileSync(templatesPath(), "utf8")
  const parsed = yaml.load(raw) as TemplatesFile
  cached = parsed.templates ?? []
  return cached
}

export function getCreativeTemplate(id: string): CreativeTemplate | undefined {
  return loadCreativeTemplates().find((t) => t.id === id)
}

export function staticVariationsForTemplate(template: CreativeTemplate): CreativeTemplateStaticVariation[] {
  if (template.static_variations?.length) return template.static_variations
  if (template.static_playbook === "host_monetization_v3") {
    return HOST_MONETIZATION_CANONICAL_VARIATIONS.map((v) => ({
      variation_label: v.variation_label,
      headline: v.headline,
      background_image_prompt: v.background_image_prompt,
    }))
  }
  return []
}

export function buildBriefFromTemplate(
  template: CreativeTemplate,
  opts?: { conceptVerify?: boolean; uploadedGcsPath?: string }
) {
  const conceptVerify = opts?.conceptVerify ?? template.concept_verify_default
  const variations = conceptVerify
    ? 1
    : (template.full_batch_variations as 1 | 2 | 3)

  const triggerData: Record<string, unknown> = {
    template_id: template.id,
    category: template.category,
    angle: template.angle,
    naming: template.naming,
    variations,
    concept_verify: conceptVerify,
  }

  if (template.static_playbook) {
    triggerData.static_playbook = template.static_playbook
  }

  if (template.generation_tool) {
    triggerData.generation_tool = template.generation_tool
  }
  if (template.svg_template_id) {
    triggerData.svg_template_id = template.svg_template_id
  }

  const staticVars = staticVariationsForTemplate(template)
  if (staticVars.length) {
    triggerData.static_variations = staticVars.slice(0, variations)
  }

  if (template.svg_variations?.length) {
    triggerData.svg_variations = template.svg_variations.slice(0, variations).map((variation) => ({
      ...variation,
      tokens: {
        ...(template.svg_tokens ?? {}),
        ...variation.tokens,
      },
    }))
    if (template.svg_template_id) {
      triggerData.svg_tokens = {
        ...(template.svg_tokens ?? {}),
        ...(template.svg_variations[0]?.tokens ?? {}),
      }
    }
  } else if (template.svg_tokens && template.svg_template_id) {
    triggerData.svg_tokens = template.svg_tokens
  }

  const format = template.formats.join(",")
  const successCriteria = { variations, formats: template.formats, concept_verify: conceptVerify }

  if (template.type === "video" && template.video) {
    const v = template.video
    const copyVariants: VideoCopyVariant[] = v.copy_variants.slice(0, variations).map((cv) => ({
      slug: cv.slug,
      copy: cv.copy,
      variant: cv.variant,
      angle: template.angle,
    }))

    const video_config: VideoConfig = {
      source: v.source,
      conceptSlug: v.concept_slug,
      assetSlug: v.asset_slug,
      templateVersion: v.template_version,
      duration: v.duration,
      ratio: v.ratio,
      runwayPrompt: v.runway_prompt,
      uploadedGcsPath: opts?.uploadedGcsPath,
      copyVariants,
      naming: {
        testId: template.naming.test_id,
        format: template.naming.format,
        cta: template.naming.cta,
      },
    }

    return {
      trigger_type: template.defaults.trigger_type ?? "manual",
      trigger_data: triggerData,
      status: "briefed" as const,
      hypothesis: template.defaults.hypothesis ?? null,
      target_audience: template.defaults.target_audience ?? null,
      hook: template.defaults.hook ?? copyVariants[0]?.copy ?? null,
      format: "9x16",
      visual_direction: null,
      copy_primary: template.defaults.copy_primary ?? null,
      copy_headline: template.defaults.copy_headline ?? null,
      copy_subtext: template.defaults.copy_subtext ?? null,
      cta: template.defaults.cta ?? null,
      campaign_short_name: template.defaults.campaign_short_name ?? v.concept_slug,
      success_criteria: successCriteria,
      video_config,
    }
  }

  return {
    trigger_type: template.defaults.trigger_type ?? "manual",
    trigger_data: triggerData,
    status: "briefed" as const,
    hypothesis: template.defaults.hypothesis ?? null,
    target_audience: template.defaults.target_audience ?? null,
    hook: template.defaults.hook ?? null,
    format,
    visual_direction: template.defaults.visual_direction ?? null,
    copy_primary: template.defaults.copy_primary ?? null,
    copy_headline: template.defaults.copy_headline ?? null,
    copy_subtext: template.defaults.copy_subtext ?? null,
    cta: template.defaults.cta ?? null,
    campaign_short_name: template.defaults.campaign_short_name ?? template.angle,
    success_criteria: successCriteria,
    video_config: null,
  }
}

export function resolveNamingFromBrief(brief: {
  trigger_data?: Record<string, unknown> | null
  format?: string | null
}): CreativeTemplateNaming | null {
  const td = brief.trigger_data
  if (!td || typeof td !== "object") return null
  const naming = td.naming
  if (!naming || typeof naming !== "object") return null
  const n = naming as Record<string, unknown>
  if (typeof n.test_id !== "string" || typeof n.format !== "string" || typeof n.cta !== "string") {
    return null
  }
  return {
    test_id: n.test_id,
    format: n.format,
    cta: n.cta,
    ...(typeof n.template_slug === "string" ? { template_slug: n.template_slug } : {}),
  }
}
