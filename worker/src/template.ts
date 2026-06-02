/**
 * Master video template — locked thrml brand spec for video creative.
 *
 * Versioning: bump `version` and create a new template constant when the
 * brand requires a meaningfully different visual treatment. Do NOT modify
 * v1 once renders have been produced against it.
 */

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
  /** v3 — block split: orange top block + bottom video region. */
  blockSplit?: BlockSplitLayout
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
    topBlockHeight: 640,
    videoHeight: 1280,
    brandColor: "C75B3A",
    paddingX: 80,
    brandFontSize: 64,
    brandY: 96,
    eyebrowFontSize: 22,
    eyebrowY: 232,
    headlineFontSize: 72,
    headlineY: 304,
    headlineMaxChars: 22,
    headlineMaxLines: 2,
    subheadFontSize: 24,
    subheadY: 560,
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
