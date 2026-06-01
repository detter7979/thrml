/** Default POV overlay for sauna host video compositing (template v2). */
export const DEFAULT_POV_VIDEO_COPY = "pov: you turned your idle sauna into income"

/** Two-line overlay matching IG Story POV ads — use `\n` for FFmpeg drawtext. */
export const DEFAULT_POV_VIDEO_OVERLAY = "pov: you turned your idle sauna\ninto income"

/** Compositing template for POV sauna b-roll briefs (T2/T4). */
export const DEFAULT_POV_SAUNA_TEMPLATE_VERSION = 2

/** Default Runway image-to-video prompt for T2 POV sauna briefs. */
export const DEFAULT_RUNWAY_POV_PROMPT =
  "First-person POV walking toward a private cedar barrel sauna in a Pacific Northwest backyard at golden hour, slow cinematic motion, no people, no text"

export function formatPovVideoOverlay(copy: string): string {
  const trimmed = copy.trim()
  if (!trimmed) return DEFAULT_POV_VIDEO_OVERLAY
  if (trimmed.includes("\n")) return trimmed
  if (trimmed === DEFAULT_POV_VIDEO_COPY) return DEFAULT_POV_VIDEO_OVERLAY
  const match = trimmed.match(/^(.+\s)into income\.?$/i)
  if (match) return `${match[1].trim()}\ninto income`
  return trimmed
}
