/**
 * Master video template — locked thrml brand spec for video creative.
 *
 * Versioning: bump `version` and create a new template constant when the
 * brand requires a meaningfully different visual treatment. Do NOT modify
 * v1 once renders have been produced against it.
 */

import { BRAND_RUST_HEX } from "./brand-colors.js"

export interface BlockSplitLayout {
  width: number
  height: number
  topBlockHeight: number
  videoHeight: number
  brandColor: string
  paddingX: number
  brandFontSize: number
  brandY: number
  eyebrowFontSize: number
  eyebrowY: number
  headlineFontSize: number
  headlineY: number
  headlineMaxChars: number
  headlineMaxLines: number
  subheadFontSize: number
  subheadY: number
}

export interface VideoTemplate {
  version: number
  width: number
  height: number
  textColor: string
  /** POV v2: drawtext alpha (0–1). Split-header headline uses 0.92. */
  textOpacity?: number
  /** Fixed fontsize when fontSizeRatio is omitted. */
  textSize: number
  /** Legacy v1: fixed drawtext y. */
  textTopOffset: number
  /** POV v2: vertically center the text block at this fraction of frame height. */
  textTopRatio?: number
  /** POV v2: drawtext line_spacing between wrapped lines (px) — single-block fallback only. */
  textLineSpacing?: number
  /** POV v2: line-height ratio between stacked overlay lines (max ~1.2). */
  textLineHeightRatio?: number
  /** POV v2: fontsize = round(h * fontSizeRatio). */
  fontSizeRatio?: number
  fontPath: string
  logoPath: string
  logoWidth: number
  logoBottomMargin: number
  logoOpacity: number
  gradientHeight: number
  gradientMaxOpacity: number
  showGradient?: boolean
  showLogo?: boolean
  /** Logo width as a fraction of the frame width (used instead of logoWidth when set). */
  logoWidthRatio?: number
  /** Visible area of the logo file (it has transparent padding), so it scales and centres correctly. */
  logoCrop?: { width: number; height: number; x: number; y: number }
  /** Where the logo sits; margins keep it inside the Stories / Reels safe zone. */
  logoPosition?: "top" | "bottom"
  /** Distance from the top or bottom edge as a fraction of frame height. */
  logoMarginRatio?: number
  /** v3 — block split: orange top block + bottom video region. */
  blockSplit?: BlockSplitLayout
}

/**
 * Per-job overrides chosen on the brief (render_jobs.render_options). Everything is optional;
 * an empty object renders the template exactly as before.
 */
export interface RenderOptions {
  /** Vertical centre of the POV text, as % of frame height (0 = top edge, 100 = bottom edge). */
  textPositionPct?: number
  showLogo?: boolean
  /** 0–1. */
  logoOpacity?: number
  logoPosition?: "top" | "bottom"
  /** Re-render counter; keeps each re-render in its own output file. */
  revision?: number
}

/** The wordmark occupies this box inside assets/thrml-logo.png (551×200 with transparent padding). */
export const THRML_LOGO_CROP = { width: 263, height: 85, x: 0, y: 57 }

/** Keep text clear of the app UI at the very top and bottom of a 9:16 frame. */
export const TEXT_POSITION_MIN_PCT = 12
export const TEXT_POSITION_MAX_PCT = 85

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function parseRenderOptions(raw: unknown): RenderOptions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const r = raw as Record<string, unknown>
  const out: RenderOptions = {}
  const pos = Number(r.textPositionPct)
  if (r.textPositionPct != null && Number.isFinite(pos)) {
    out.textPositionPct = clamp(pos, TEXT_POSITION_MIN_PCT, TEXT_POSITION_MAX_PCT)
  }
  if (typeof r.showLogo === "boolean") out.showLogo = r.showLogo
  const opacity = Number(r.logoOpacity)
  if (r.logoOpacity != null && Number.isFinite(opacity)) out.logoOpacity = clamp(opacity, 0, 1)
  if (r.logoPosition === "top" || r.logoPosition === "bottom") out.logoPosition = r.logoPosition
  const revision = Number(r.revision)
  if (r.revision != null && Number.isInteger(revision) && revision > 0) out.revision = revision
  return out
}

/** Returns a copy of the template with the brief's overrides applied (POV overlay templates only). */
export function applyRenderOptions(template: VideoTemplate, options: RenderOptions): VideoTemplate {
  if (template.blockSplit) return template
  const t: VideoTemplate = { ...template }
  if (options.textPositionPct != null && t.textTopRatio != null) {
    t.textTopRatio = Math.round(options.textPositionPct * 10) / 1000
  }
  if (options.showLogo === true) {
    t.showLogo = true
    t.logoWidthRatio = t.logoWidthRatio ?? 0.22
    t.logoCrop = t.logoCrop ?? THRML_LOGO_CROP
    t.logoPosition = options.logoPosition ?? t.logoPosition ?? "bottom"
    t.logoMarginRatio = t.logoMarginRatio ?? (t.logoPosition === "top" ? 0.12 : 0.17)
    t.logoOpacity = options.logoOpacity ?? (t.logoOpacity > 0 ? t.logoOpacity : 0.85)
  } else if (options.showLogo === false) {
    t.showLogo = false
  }
  return t
}

/** v1 — bottom gradient scrim, centered copy mid-frame, thrml logo lockup. */
export const templateV1: VideoTemplate = {
  version: 1,
  width: 720,
  height: 1280,
  textColor: "F5F0E8",
  textSize: 36,
  textTopOffset: 546,
  fontPath: "assets/DMSerifDisplay-Regular.ttf",
  logoPath: "assets/thrml-logo.png",
  logoWidth: 144,
  logoBottomMargin: 120,
  logoOpacity: 0.75,
  gradientHeight: 500,
  gradientMaxOpacity: 0.7,
  showGradient: true,
  showLogo: true,
}

/**
 * v2 — IG Story POV overlay for T2 (Runway) and T4 (upload): centered DM Serif on
 * the sauna fascia (between roof line and door header). See `DEFAULT_POV_VIDEO_OVERLAY`.
 */
export const templateV2: VideoTemplate = {
  version: 2,
  width: 1080,
  height: 1920,
  textColor: "FFFFFF",
  textOpacity: 0.92,
  textSize: 42,
  textTopOffset: 0,
  /** Vertical center of copy block (~40% frame height — fascia / door header band). */
  textTopRatio: 0.4,
  textLineSpacing: 8,
  textLineHeightRatio: 1.2,
  /** 0.0328 prior size × 0.9 for fascia band + side padding. */
  fontSizeRatio: 0.0295,
  fontPath: "assets/DMSerifDisplay-Regular.ttf",
  logoPath: "assets/thrml-logo.png",
  logoWidth: 0,
  logoBottomMargin: 0,
  logoOpacity: 0,
  gradientHeight: 0,
  gradientMaxOpacity: 0,
  showGradient: false,
  showLogo: false,
}

/**
 * v3 — Block split (T5): orange top block with brand copy; uploaded video fills bottom half.
 * Matches thrml_block_split_static_9x16.svg layout.
 */
export const templateV3: VideoTemplate = {
  version: 3,
  width: 1080,
  height: 1920,
  textColor: "FFFFFF",
  textSize: 72,
  textTopOffset: 0,
  fontPath: "assets/DMSerifDisplay-Regular.ttf",
  logoPath: "assets/thrml-logo.png",
  logoWidth: 0,
  logoBottomMargin: 0,
  logoOpacity: 0,
  gradientHeight: 0,
  gradientMaxOpacity: 0,
  showGradient: false,
  showLogo: false,
  blockSplit: {
    width: 1080,
    height: 1920,
    topBlockHeight: 880,
    videoHeight: 1040,
    brandColor: BRAND_RUST_HEX,
    paddingX: 80,
    brandFontSize: 64,
    brandY: 336,
    eyebrowFontSize: 22,
    eyebrowY: 472,
    headlineFontSize: 72,
    headlineY: 544,
    headlineMaxChars: 22,
    headlineMaxLines: 2,
    subheadFontSize: 24,
    subheadY: 800,
  },
}

export function getTemplate(version: number): VideoTemplate {
  if (version === 1) return templateV1
  if (version === 2) return templateV2
  if (version === 3) return templateV3
  throw new Error(`Unknown template version: ${version}`)
}

export const DEFAULT_POV_SAUNA_TEMPLATE_VERSION = 2
export const DEFAULT_BLOCK_SPLIT_VIDEO_TEMPLATE_VERSION = 3
