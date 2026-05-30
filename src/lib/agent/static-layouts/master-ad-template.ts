import sharp from "sharp"

import {
  buildBrandAdFontStyleBlock,
  loadBrandSansMediumDataUrl,
  loadBrandSerifFontDataUrls,
} from "@/lib/agent/static-layouts/brand-ad-fonts"

/**
 * Master Ad Template renderer.
 *
 * Single source of truth for the visual composition described in
 * `agents/design.md` §1 (Master Ad Template). Both the production composer
 * (`src/lib/agent/static-generator.ts`) and the local preview script
 * (`scripts/render-design-sample.ts`) call this module so that locally-rendered
 * previews always match what gets shipped to Meta.
 *
 * The renderer composites a fixed text overlay onto a Replicate-generated base
 * photo. The two fields that may legally vary across A/B variants are
 * `headline` and the upstream `baseImage` prompt. Sub-headline is locked across
 * variants of the same parent brief.
 */

export type MasterAdTemplateFormat = "1x1" | "9x16" | "4x5"

export type RenderMasterAdTemplateOptions = {
  baseImage: Buffer
  format: MasterAdTemplateFormat
  headline: string
  subhead: string
}

const PALETTE = {
  gradient: "#121212",
  headline: "#FFFFFF",
  subhead: "#A0A0A0",
  wordmark: "#FFFFFF",
} as const

const WORDMARK_OPACITY = 0.8
const HEADLINE_GAP = 24

/** Sub-headline tracking (premium editorial; headline stays default tracking). */
const SUBHEAD_LETTER_SPACING_EM = 0.03

/**
 * Bottom-half overlay: `#121212` ramp. Base stop at **50%** opacity per host
 * monetization legibility spec (`agents/design.md` §1.3).
 */
const GRADIENT_BOTTOM = {
  topOpacity: 0,
  midOffsetPercent: 60,
  midOpacity: 0.2,
  bottomOpacity: 0.5,
} as const

type FormatSpec = {
  width: number
  height: number
  padding: number
  wordmarkSize: number
  headlineSize: number
  subheadSize: number
}

const SPECS: Record<MasterAdTemplateFormat, FormatSpec> = {
  "9x16": { width: 1080, height: 1920, padding: 80, wordmarkSize: 64, headlineSize: 88, subheadSize: 30 },
  "1x1": { width: 1080, height: 1080, padding: 64, wordmarkSize: 56, headlineSize: 76, subheadSize: 28 },
  "4x5": { width: 1080, height: 1350, padding: 64, wordmarkSize: 56, headlineSize: 80, subheadSize: 28 },
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
  return value.length * fontSize * 0.55
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

async function buildOverlay(spec: FormatSpec, headline: string, subhead: string) {
  const { serif, sansMedium } = await loadFontDataUrls()
  const fontStyles = buildBrandAdFontStyleBlock(serif, sansMedium)

  const { width, height, padding, wordmarkSize, headlineSize, subheadSize } = spec
  const wordmarkBaseline = padding + wordmarkSize - 6

  const headlineLineHeight = Math.round(headlineSize * 1.05)
  const subheadLineHeight = Math.round(subheadSize * 1.4)

  const subheadLines = wrapText(subhead, subheadSize, width - padding * 2)
  const headlineLines = wrapText(headline, headlineSize, width - padding * 2)

  // Bottom-anchored stack: subhead sits with `padding` from the canvas bottom,
  // headline sits directly above with `HEADLINE_GAP` between them. This keeps
  // the text snug in the bottom-left corner regardless of line counts.
  const subheadBaselineLast = height - padding
  const subheadBaselineFirst = subheadBaselineLast - (subheadLines.length - 1) * subheadLineHeight
  const headlineBaselineLast = subheadBaselineFirst - subheadSize - HEADLINE_GAP
  const headlineBaselineFirst = headlineBaselineLast - (headlineLines.length - 1) * headlineLineHeight

  const gradientStartY = Math.round(height * 0.5)
  const gradientHeight = height - gradientStartY

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${fontStyles}
      <defs>
        <linearGradient id="bottom-gradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${PALETTE.gradient}" stop-opacity="${GRADIENT_BOTTOM.topOpacity}" />
          <stop offset="${GRADIENT_BOTTOM.midOffsetPercent}%" stop-color="${PALETTE.gradient}" stop-opacity="${GRADIENT_BOTTOM.midOpacity}" />
          <stop offset="100%" stop-color="${PALETTE.gradient}" stop-opacity="${GRADIENT_BOTTOM.bottomOpacity}" />
        </linearGradient>
      </defs>
      <rect x="0" y="${gradientStartY}" width="${width}" height="${gradientHeight}" fill="url(#bottom-gradient)" />
      <text x="${padding}" y="${wordmarkBaseline}" fill="${PALETTE.wordmark}" fill-opacity="${WORDMARK_OPACITY}" font-family='"DM Serif Display", Georgia, "Times New Roman", serif' font-size="${wordmarkSize}" font-weight="400" letter-spacing="-1">thrml</text>
      ${multilineText({
        text: headline,
        x: padding,
        yBaseline: headlineBaselineFirst,
        fontSize: headlineSize,
        lineHeight: headlineLineHeight,
        maxWidth: width - padding * 2,
        family: "serif",
        fill: PALETTE.headline,
      })}
      ${multilineText({
        text: subhead,
        x: padding,
        yBaseline: subheadBaselineFirst,
        fontSize: subheadSize,
        lineHeight: subheadLineHeight,
        maxWidth: width - padding * 2,
        family: "sans",
        fill: PALETTE.subhead,
        fontWeight: 500,
        letterSpacingEm: SUBHEAD_LETTER_SPACING_EM,
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

  const overlay = await buildOverlay(spec, opts.headline, opts.subhead)

  return sharp(base).composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer()
}

export const __internal = {
  SPECS,
  PALETTE,
  WORDMARK_OPACITY,
  HEADLINE_GAP,
  GRADIENT_BOTTOM,
  SUBHEAD_LETTER_SPACING_EM,
}
