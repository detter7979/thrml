/**
 * Shared thrml ad typography — font sizes, opacity, and tracking used across
 * T1 Master Ad, block-split SVGs, and split-header SVGs.
 *
 * Y positions differ by layout (full-bleed vs orange block); sizes and opacity
 * stay aligned per format.
 */

export type BrandAdFormat = "1x1" | "4x5" | "9x16"

export const BRAND_AD_OPACITY = {
  wordmark: 0.85,
  eyebrow: 0.75,
  headline: 0.92,
  subhead: 0.78,
} as const

export const BRAND_AD_LETTER_SPACING_EM = {
  wordmark: -0.02,
  eyebrow: 0.14,
  subhead: 0.03,
} as const

/** Split-header top scrim — black ramp over photo. */
export const BRAND_AD_TOP_SCRIM = {
  color: "#000000",
  topOpacity: 0.48,
  bottomOpacity: 0,
  /** Scrim rect height per format (from thrml_split_header_static_*.svg). */
  heightByFormat: {
    "9x16": 1056,
    "1x1": 594,
    "4x5": 743,
  } satisfies Record<BrandAdFormat, number>,
  /** 9:16 uses a stronger top stop; 1:1 and 4:5 use 0.42 in split-header SVGs. */
  topOpacityByFormat: {
    "9x16": 0.48,
    "1x1": 0.42,
    "4x5": 0.42,
  } satisfies Record<BrandAdFormat, number>,
} as const

export const BRAND_AD_TYPE_SCALE: Record<
  BrandAdFormat,
  {
    padX: number
    wordmarkSize: number
    eyebrowSize: number
    headlineSize: number
    subheadSize: number
    headlineLineHeight: number
    subheadLineHeight: number
    maxTextWidth: number
  }
> = {
  "9x16": {
    padX: 80,
    wordmarkSize: 64,
    eyebrowSize: 22,
    headlineSize: 72,
    subheadSize: 24,
    headlineLineHeight: 76,
    subheadLineHeight: 29,
    maxTextWidth: 920,
  },
  "1x1": {
    padX: 72,
    wordmarkSize: 52,
    eyebrowSize: 18,
    headlineSize: 56,
    subheadSize: 20,
    headlineLineHeight: 64,
    subheadLineHeight: 24,
    maxTextWidth: 900,
  },
  "4x5": {
    padX: 72,
    wordmarkSize: 56,
    eyebrowSize: 20,
    headlineSize: 64,
    subheadSize: 22,
    headlineLineHeight: 72,
    subheadLineHeight: 26,
    maxTextWidth: 900,
  },
}

/** Block-split text stack Y baselines (T1 Master Ad uses these on full-bleed photos). */
export const BRAND_AD_BLOCK_SPLIT_Y: Record<
  BrandAdFormat,
  { wordmarkY: number; eyebrowY: number; headlineY: number; subheadY: number }
> = {
  "9x16": { wordmarkY: 96, eyebrowY: 232, headlineY: 304, subheadY: 560 },
  "1x1": { wordmarkY: 88, eyebrowY: 214, headlineY: 274, subheadY: 490 },
  "4x5": { wordmarkY: 96, eyebrowY: 243, headlineY: 315, subheadY: 525 },
}
