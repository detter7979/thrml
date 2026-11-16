export interface NamingDefaults {
  testId: string
  format: string
  cta: string
}

export interface VideoCopyVariant {
  slug: string // e.g. "pov-earn-1000"
  copy: string // e.g. "pov: your sauna earns you $1,000/mo"
  variant?: "A" | "B" | "C" | "D"
  angle?: string
}

/** Overlay choices for the POV video template; stored on the brief and copied to each render job. */
export interface VideoOverlayOptions {
  /** Vertical centre of the overlay text, % of frame height (0 = top, 100 = bottom). Default 40. */
  textPositionPct?: number
  showLogo?: boolean
  /** 0–1. Default 0.85. */
  logoOpacity?: number
  logoPosition?: "top" | "bottom"
}

export const DEFAULT_VIDEO_TEXT_POSITION_PCT = 40
export const DEFAULT_VIDEO_LOGO_OPACITY = 0.85
/** Mirrors the worker's safe-zone clamp (worker/src/template.ts). */
export const VIDEO_TEXT_POSITION_MIN_PCT = 12
export const VIDEO_TEXT_POSITION_MAX_PCT = 85

export interface VideoConfig {
  source: "runway" | "uploaded"
  runwayPrompt?: string // required if source = 'runway'
  uploadedGcsPath?: string // required if source = 'uploaded', format: bases/...
  copyVariants: VideoCopyVariant[] // 1+ variants to render from the base
  templateVersion: number // 1 = legacy scrim+logo; 2 = centered POV overlay (T2); 3 = block split (T5)
  conceptSlug: string // e.g. "sauna-pov-earnings"
  assetSlug: string // e.g. "sauna"
  duration?: 5 | 10 // Runway only
  ratio?: "720:1280" | "1280:720" | "768:1280" | "1280:768" // legacy values normalized at Runway call
  naming?: NamingDefaults
  /** POV overlay only (template version 2): text height and optional logo. */
  overlay?: VideoOverlayOptions
}

export interface RenderJob {
  id: string
  brief_id: string
  variant_slug: string
  copy_text: string
  ad_name?: string | null
  status: "pending" | "running" | "completed" | "failed" | "cancelled"
  attempts: number
  max_attempts?: number
  error_message: string | null
  rendered_gcs_path: string | null
  rendered_asset_id: string | null
  duration_ms: number | null
  created_at: string
  completed_at: string | null
  signed_url?: string | null
}

export type CreativeBrief = {
  id: string
  status: string | null
  video_config?: VideoConfig | null
  [key: string]: unknown
}

export type VideoBriefWithJobs = CreativeBrief & {
  video_config: VideoConfig
  renderJobs: RenderJob[]
}
