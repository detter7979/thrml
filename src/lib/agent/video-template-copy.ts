/** Default POV overlay for sauna host video compositing (template v2). */
export const DEFAULT_POV_VIDEO_COPY = "pov: you turned your idle sauna into income"

/** Two-line overlay matching IG Story POV ads — use `\n` for FFmpeg drawtext. */
export const DEFAULT_POV_VIDEO_OVERLAY = "pov: you turned your idle sauna\ninto income"

/** Compositing template for POV sauna b-roll briefs (T2). */
export const DEFAULT_POV_SAUNA_TEMPLATE_VERSION = 2

/** Compositing template for block split upload briefs (T5). */
export const DEFAULT_BLOCK_SPLIT_VIDEO_TEMPLATE_VERSION = 3

/** Default Runway image-to-video prompt for T2 POV sauna briefs. */
export const DEFAULT_RUNWAY_POV_PROMPT =
  "First-person POV walking toward a private cedar barrel sauna in a Pacific Northwest backyard at golden hour, slow cinematic motion, no people, no text"

export type BlockSplitVideoOverlay = {
  taglineEyebrow: string
  headline: string
  subhead: string
}

export const DEFAULT_BLOCK_SPLIT_VIDEO_OVERLAY: BlockSplitVideoOverlay = {
  taglineEyebrow: "PRIVATE WELLNESS, BY THE HOUR.",
  headline: "Turn your idle sauna into income.",
  subhead: "Backyard and cabin saunas in Seattle.",
}

export function formatPovVideoOverlay(copy: string): string {
  const trimmed = copy.trim()
  if (!trimmed) return DEFAULT_POV_VIDEO_OVERLAY
  if (trimmed.includes("\n")) return trimmed
  if (trimmed === DEFAULT_POV_VIDEO_COPY) return DEFAULT_POV_VIDEO_OVERLAY
  const match = trimmed.match(/^(.+\s)into income\.?$/i)
  if (match) return `${match[1].trim()}\ninto income`
  return trimmed
}

export function formatBlockSplitVideoOverlay(overlay: BlockSplitVideoOverlay): string {
  return JSON.stringify({
    taglineEyebrow: overlay.taglineEyebrow.trim() || DEFAULT_BLOCK_SPLIT_VIDEO_OVERLAY.taglineEyebrow,
    headline: overlay.headline.trim() || DEFAULT_BLOCK_SPLIT_VIDEO_OVERLAY.headline,
    subhead: overlay.subhead.trim() || DEFAULT_BLOCK_SPLIT_VIDEO_OVERLAY.subhead,
  })
}

export function parseBlockSplitVideoOverlay(copyText: string): BlockSplitVideoOverlay {
  const trimmed = copyText.trim()
  if (!trimmed) return DEFAULT_BLOCK_SPLIT_VIDEO_OVERLAY

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      return {
        taglineEyebrow:
          typeof parsed.taglineEyebrow === "string"
            ? parsed.taglineEyebrow
            : DEFAULT_BLOCK_SPLIT_VIDEO_OVERLAY.taglineEyebrow,
        headline:
          typeof parsed.headline === "string" ? parsed.headline : DEFAULT_BLOCK_SPLIT_VIDEO_OVERLAY.headline,
        subhead:
          typeof parsed.subhead === "string" ? parsed.subhead : DEFAULT_BLOCK_SPLIT_VIDEO_OVERLAY.subhead,
      }
    } catch {
      // fall through
    }
  }

  return {
    ...DEFAULT_BLOCK_SPLIT_VIDEO_OVERLAY,
    headline: trimmed,
  }
}
