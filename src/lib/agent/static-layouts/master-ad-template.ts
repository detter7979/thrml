import sharp from "sharp"

import {
  BRAND_AD_BLOCK_SPLIT_Y,
  BRAND_AD_LETTER_SPACING_EM,
  BRAND_AD_OPACITY,
  BRAND_AD_TOP_SCRIM,
  BRAND_AD_TYPE_SCALE,
  type BrandAdFormat,
} from "@/lib/agent/static-layouts/brand-ad-typography"
import {
  buildBrandAdFontStyleBlock,
  loadBrandSansMediumDataUrl,
  loadBrandSerifFontDataUrls,
  renderBrandAdSvgToPng,
} from "@/lib/agent/static-layouts/brand-ad-fonts"
import { SPLIT_HEADER_DEFAULTS } from "@/lib/agent/svg-template-shared"

/**
 * Master Ad Template renderer (T1).
 *
 * Text positions mirror block-split Y baselines; scrim matches split-header.
 * Typography constants live in `brand-ad-typography.ts`.
 */

export type MasterAdTemplateFormat = BrandAdFormat

export type RenderMasterAdTemplateOptions = {
  baseImage: Buffer
  format: MasterAdTemplateFormat
  headline: string
  subhead: string
  taglineEyebrow?: string
}

const PALETTE = {
  gradient: BRAND_AD_TOP_SCRIM.color,
  headline: "#FFFFFF",
  subhead: "#FFFFFF",
  wordmark: "#FFFFFF",
} as const

const CANVAS: Record<MasterAdTemplateFormat, { width: number; height: number }> = {
  "9x16": { width: 1080, height: 1920 },
  "1x1": { width: 1080, height: 1080 },
  "4x5": { width: 1080, height: 1350 },
}

type FormatSpec = {
  width: number
  height: number
  padX: number
  wordmarkY: number
  wordmarkSize: number
  eyebrowY: number
  eyebrowSize: number
  headlineY: number
  headlineSize: number
  headlineLineHeight: number
  subheadY: number
  subheadSize: number
  subheadLineHeight: number
  maxTextWidth: number
  scrimHeight: number
  scrimTopOpacity: number
}

function buildFormatSpec(format: MasterAdTemplateFormat): FormatSpec {
  const canvas = CANVAS[format]
  const type = BRAND_AD_TYPE_SCALE[format]
  const y = BRAND_AD_BLOCK_SPLIT_Y[format]
  return {
    width: canvas.width,
    height: canvas.height,
    padX: type.padX,
    wordmarkY: y.wordmarkY,
    wordmarkSize: type.wordmarkSize,
    eyebrowY: y.eyebrowY,
    eyebrowSize: type.eyebrowSize,
    headlineY: y.headlineY,
    headlineSize: type.headlineSize,
    headlineLineHeight: type.headlineLineHeight,
    subheadY: y.subheadY,
    subheadSize: type.subheadSize,
    subheadLineHeight: type.subheadLineHeight,
    maxTextWidth: type.maxTextWidth,
    scrimHeight: BRAND_AD_TOP_SCRIM.heightByFormat[format],
    scrimTopOpacity: BRAND_AD_TOP_SCRIM.topOpacityByFormat[format],
  }
}

const SPECS: Record<MasterAdTemplateFormat, FormatSpec> = {
  "9x16": buildFormatSpec("9x16"),
  "1x1": buildFormatSpec("1x1"),
  "4x5": buildFormatSpec("4x5"),
}

let fontDataUrlsPromise: Promise<{ serif: { regular: string; italic: string }; sansMedium: string }> | null = null

async function loadFontDataUrls() {
  if (!fontDataUrlsPromise) {
    fontDataUrlsPromise = Promise.all([loadBrandSerifFontDataUrls(), loadBrandSansMediumDataUrl()]).then(
      ([serif, sansMedium]) => ({ serif, sansMedium }),
    )
  }
  return fontDataUrlsPromise
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function estimateTextWidth(value: string, fontSize: number) {
  return value.length * fontSize * 0.52
}

function wrapText(value: string, fontSize: number, maxWidth: number) {
  const words = value.trim().split(/\s+/).filter(Boolean)
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
  }
  if (line) lines.push(line)
  return lines.length ? lines : [""]
}

function multilineText(opts: {
  text: string
  x: number
  yBaseline: number
  fontSize: number
  lineHeight: number
  maxWidth: number
  family: "serif" | "sans"
  fill: string
  fillOpacity?: number
  fontWeight?: number
  letterSpacingEm?: number
}) {
  const lines = wrapText(opts.text, opts.fontSize, opts.maxWidth)
  const familyStack =
    opts.family === "serif"
      ? '"DM Serif Display", Georgia, "Times New Roman", serif'
      : '"thrml-sans", "Geist", "Helvetica Neue", Arial, sans-serif'
  const fontWeight = opts.fontWeight ?? (opts.family === "sans" ? 500 : 400)
  const letterSpacing =
    opts.letterSpacingEm != null ? ` letter-spacing="${opts.letterSpacingEm}em"` : ""
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${opts.x}" dy="${index === 0 ? 0 : opts.lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("")
  return `
    <text x="${opts.x}" y="${opts.yBaseline}" fill="${opts.fill}" fill-opacity="${
      opts.fillOpacity ?? 1
    }" font-family='${familyStack}' font-size="${opts.fontSize}" font-weight="${fontWeight}"${letterSpacing}>
      ${tspans}
    </text>
  `
}

async function buildOverlay(
  spec: FormatSpec,
  headline: string,
  subhead: string,
  taglineEyebrow: string,
) {
  const { serif, sansMedium } = await loadFontDataUrls()
  const fontStyles = buildBrandAdFontStyleBlock(serif, sansMedium)

  const {
    width,
    padX,
    wordmarkY,
    wordmarkSize,
    eyebrowY,
    eyebrowSize,
    headlineY,
    headlineSize,
    headlineLineHeight,
    subheadY,
    subheadSize,
    subheadLineHeight,
    maxTextWidth,
    scrimHeight,
    scrimTopOpacity,
  } = spec

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${spec.height}" viewBox="0 0 ${width} ${spec.height}">
      ${fontStyles}
      <defs>
        <linearGradient id="top-scrim" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${PALETTE.gradient}" stop-opacity="${scrimTopOpacity}" />
          <stop offset="100%" stop-color="${PALETTE.gradient}" stop-opacity="${BRAND_AD_TOP_SCRIM.bottomOpacity}" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${scrimHeight}" fill="url(#top-scrim)" />
      <text x="${padX}" y="${wordmarkY}" fill="${PALETTE.wordmark}" fill-opacity="${BRAND_AD_OPACITY.wordmark}" font-family='"DM Serif Display", Georgia, "Times New Roman", serif' font-size="${wordmarkSize}" font-weight="400" letter-spacing="${BRAND_AD_LETTER_SPACING_EM.wordmark}em">thrml</text>
      <text x="${padX}" y="${eyebrowY}" fill="${PALETTE.subhead}" fill-opacity="${BRAND_AD_OPACITY.eyebrow}" font-family='"thrml-sans", "Geist", "Helvetica Neue", Arial, sans-serif' font-size="${eyebrowSize}" font-weight="500" letter-spacing="${BRAND_AD_LETTER_SPACING_EM.eyebrow}em">${escapeXml(taglineEyebrow)}</text>
      ${multilineText({
        text: headline,
        x: padX,
        yBaseline: headlineY,
        fontSize: headlineSize,
        lineHeight: headlineLineHeight,
        maxWidth: maxTextWidth,
        family: "serif",
        fill: PALETTE.headline,
        fillOpacity: BRAND_AD_OPACITY.headline,
      })}
      ${multilineText({
        text: subhead,
        x: padX,
        yBaseline: subheadY,
        fontSize: subheadSize,
        lineHeight: subheadLineHeight,
        maxWidth: maxTextWidth,
        family: "sans",
        fill: PALETTE.subhead,
        fillOpacity: BRAND_AD_OPACITY.subhead,
        fontWeight: 500,
        letterSpacingEm: BRAND_AD_LETTER_SPACING_EM.subhead,
      })}
    </svg>
  `

  return Buffer.from(svg)
}

export async function renderMasterAdTemplate(opts: RenderMasterAdTemplateOptions): Promise<Buffer> {
  const spec = SPECS[opts.format]
  if (!spec) throw new Error(`Unsupported Master Ad Template format: ${opts.format}`)

  const base = await sharp(opts.baseImage)
    .resize(spec.width, spec.height, { fit: "cover", position: "center" })
    .png()
    .toBuffer()

  const overlaySvg = await buildOverlay(
    spec,
    opts.headline,
    opts.subhead,
    opts.taglineEyebrow?.trim() || SPLIT_HEADER_DEFAULTS.TAGLINE_EYEBROW,
  )
  const overlay = await renderBrandAdSvgToPng(overlaySvg.toString("utf8"))

  return sharp(base).composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer()
}

export const __internal = {
  SPECS,
  PALETTE,
  BRAND_AD_OPACITY,
  BRAND_AD_TOP_SCRIM,
  BRAND_AD_LETTER_SPACING_EM,
}
