#!/usr/bin/env npx tsx
/**
 * Render all registered SVG templates at default copy + hero-sauna backdrop.
 * Output: .tmp/svg-preview-<template_id>-<format>.png
 */
import fs from "node:fs"
import path from "node:path"

import yaml from "js-yaml"

import {
  prepareSvgTokens,
  renderPreparedSvg,
  renderSvgToPng,
  resolveSvgBackdropPhotoUrl,
  type SvgTemplateRegistryEntry,
} from "@/lib/agent/svg-template-generator"
import { DEFAULT_HOST_HEADLINE, SPLIT_HEADER_DEFAULTS, type SvgTemplateId } from "@/lib/agent/svg-template-shared"

const DEFAULT_TOKENS: Record<SvgTemplateId, Record<string, string>> = {
  thrml_split_header_static: {
    TAGLINE_EYEBROW: SPLIT_HEADER_DEFAULTS.TAGLINE_EYEBROW,
    HEADLINE: DEFAULT_HOST_HEADLINE,
    SUBHEAD: SPLIT_HEADER_DEFAULTS.SUBHEAD,
  },
  thrml_block_split_static: {
    TAGLINE_EYEBROW: SPLIT_HEADER_DEFAULTS.TAGLINE_EYEBROW,
    HEADLINE: DEFAULT_HOST_HEADLINE,
    SUBHEAD: SPLIT_HEADER_DEFAULTS.SUBHEAD,
  },
  thrml_pov_overlay_static: {
    POV_LINE_1: "pov: your sauna earns you $1,200/mo",
    POV_LINE_2: "List on thrml. Get paid when you're not using it.",
  },
}

function loadRegistry(): SvgTemplateRegistryEntry[] {
  const raw = fs.readFileSync("config/creative-templates.yaml", "utf8")
  const parsed = yaml.load(raw) as { svg_templates?: SvgTemplateRegistryEntry[] }
  return parsed.svg_templates ?? []
}

async function renderTemplate(template: SvgTemplateRegistryEntry, format: "1x1" | "4x5" | "9x16") {
  const templateId = template.id as SvgTemplateId
  const svgPath = path.join("config", "creative-templates", "svg", `${templateId}_${format}.svg`)
  if (!fs.existsSync(svgPath)) {
    console.warn(`[preview] Skipping missing ${svgPath}`)
    return
  }

  const tokens = {
    ...DEFAULT_TOKENS[templateId],
    PHOTO_URL: await resolveSvgBackdropPhotoUrl(templateId),
  }
  const prepared = prepareSvgTokens(templateId, format, tokens)
  const rawSvg = fs.readFileSync(svgPath, "utf8")
  const svg = renderPreparedSvg(rawSvg, prepared)
  const png = await renderSvgToPng(svg)

  fs.mkdirSync(".tmp", { recursive: true })
  const outPath = `.tmp/svg-preview-${templateId}-${format}.png`
  fs.writeFileSync(outPath, png)
  console.log(`[preview] ${template.label} (${format}) → ${outPath}`)
}

async function main() {
  const registry = loadRegistry()
  for (const template of registry) {
    for (const format of template.aspect_ratios) {
      await renderTemplate(template, format)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
