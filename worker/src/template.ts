/**
 * Master video template — locked thrml brand spec for video creative.
 *
 * Versioning: bump `version` and create a new template constant when the
 * brand requires a meaningfully different visual treatment. Do NOT modify
 * v1 once renders have been produced against it.
 */

export interface VideoTemplate {
  version: number
  width: number
  height: number
  textColor: string
  textSize: number
  textTopOffset: number
  fontPath: string
  logoPath: string
  logoWidth: number
  logoBottomMargin: number
  logoOpacity: number
  gradientHeight: number
  gradientMaxOpacity: number
}

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
}

export function getTemplate(version: number): VideoTemplate {
  if (version === 1) return templateV1
  throw new Error(`Unknown template version: ${version}`)
}
