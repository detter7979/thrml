export type BlockSplitVideoOverlay = {
  taglineEyebrow: string
  headline: string
  subhead: string
}

export function parseBlockSplitVideoOverlay(copyText: string): BlockSplitVideoOverlay {
  const trimmed = copyText.trim()
  if (!trimmed) {
    return {
      taglineEyebrow: "PRIVATE WELLNESS, BY THE HOUR.",
      headline: "Turn your idle sauna into income.",
      subhead: "Backyard and cabin saunas in Seattle.",
    }
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      return {
        taglineEyebrow:
          typeof parsed.taglineEyebrow === "string"
            ? parsed.taglineEyebrow
            : typeof parsed.TAGLINE_EYEBROW === "string"
              ? parsed.TAGLINE_EYEBROW
              : "PRIVATE WELLNESS, BY THE HOUR.",
        headline:
          typeof parsed.headline === "string"
            ? parsed.headline
            : typeof parsed.HEADLINE === "string"
              ? parsed.HEADLINE
              : trimmed,
        subhead:
          typeof parsed.subhead === "string"
            ? parsed.subhead
            : typeof parsed.SUBHEAD === "string"
              ? parsed.SUBHEAD
              : "Backyard and cabin saunas in Seattle.",
      }
    } catch {
      // fall through to plain text
    }
  }

  return {
    taglineEyebrow: "PRIVATE WELLNESS, BY THE HOUR.",
    headline: trimmed,
    subhead: "Backyard and cabin saunas in Seattle.",
  }
}

export function wrapOverlayLine(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []

  const lines: string[] = []
  let current = ""

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
    if (lines.length >= maxLines) break
  }

  if (lines.length < maxLines && current) lines.push(current)
  return lines.slice(0, maxLines)
}
