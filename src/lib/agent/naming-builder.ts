/**
 * Ad name builder for the thrml naming convention.
 *
 * Convention (per thrml_namer_v4):
 *   {adId}_{testId}_{variant}_{angle}_{format}_{cta}
 *
 * Legacy (pre–Ad ID allocation):
 *   {testId}_{variant}_{angle}_{format}_{cta}
 *
 * Example:
 *   AD001_T05_A_pov-earnings_Video_15s_list-now
 *
 * "_" separates fields and nothing else, so a name always splits into the same columns
 * (ID · test · variant · angle · format · size/length · CTA). Multi-word angle and CTA
 * tokens are joined with "-" (pov-earnings, idle-space, list-now). Names written before
 * this rule used "_" inside those tokens; parseAdName still reads them.
 */

export interface AdNameTokens {
  /** Internal namer ID e.g. AD001 — optional for legacy rows. */
  thrmlAdId?: string
  testId: string
  variant: string
  angle: string
  format: string
  cta: string
}

const THRML_AD_ID_RE = /^AD\d{3,}$/i
const TEST_ID_RE = /^T\d{2,}$/
const VARIANT_RE = /^[A-D]$/
const TOKEN_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Angle / CTA as written in a name: lowercase, words joined with "-" (never "_"). */
export function toNameToken(raw: string): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Convert a whole ad name to the current rule; returns the input when it cannot be parsed. */
export function canonicalAdName(name: string): string {
  const tokens = parseAdName(name.trim())
  if (!tokens) return name
  try {
    return buildAdName(tokens)
  } catch {
    return name
  }
}
const FORMAT_RE = /^(Static|Video|Carousel|GIF)_[a-z0-9x]+$/

const FORMAT_TYPES = ["Static", "Video", "Carousel", "GIF"] as const

export class InvalidAdNameError extends Error {
  constructor(field: string, value: string, reason: string) {
    super(`Invalid ad name token "${field}"="${value}": ${reason}`)
    this.name = "InvalidAdNameError"
  }
}

function normalizeThrmlAdId(raw?: string | null): string | undefined {
  if (!raw?.trim()) return undefined
  const v = raw.trim().toUpperCase()
  if (!THRML_AD_ID_RE.test(v)) {
    throw new InvalidAdNameError("thrmlAdId", raw, 'must match /^AD\\d{3,}$/, e.g. "AD001"')
  }
  return v
}

export function buildAdName(tokens: AdNameTokens): string {
  const thrmlAdId = normalizeThrmlAdId(tokens.thrmlAdId)

  if (!TEST_ID_RE.test(tokens.testId)) {
    throw new InvalidAdNameError("testId", tokens.testId, 'must match /^T\\d{2,}$/, e.g. "T01"')
  }
  if (!VARIANT_RE.test(tokens.variant)) {
    throw new InvalidAdNameError("variant", tokens.variant, "must be single letter A-D")
  }
  const angle = toNameToken(tokens.angle)
  if (!TOKEN_RE.test(angle)) {
    throw new InvalidAdNameError("angle", tokens.angle, 'must be lowercase words joined with "-", e.g. "idle-space"')
  }
  if (!FORMAT_RE.test(tokens.format)) {
    throw new InvalidAdNameError(
      "format",
      tokens.format,
      'must be {Type}_{spec} e.g. "Video_15s", "Static_9x16"'
    )
  }
  const cta = toNameToken(tokens.cta)
  if (!TOKEN_RE.test(cta)) {
    throw new InvalidAdNameError("cta", tokens.cta, 'must be lowercase words joined with "-", e.g. "list-now"')
  }

  const parts = [
    ...(thrmlAdId ? [thrmlAdId] : []),
    tokens.testId,
    tokens.variant,
    angle,
    tokens.format,
    cta,
  ]
  return parts.join("_")
}

export function parseAdName(name: string): AdNameTokens | null {
  let parts = name.split("_")
  if (parts.length < 5) return null

  let thrmlAdId: string | undefined
  if (parts[0] && THRML_AD_ID_RE.test(parts[0])) {
    thrmlAdId = parts[0].toUpperCase()
    parts = parts.slice(1)
  }

  if (parts.length < 5) return null
  if (!TEST_ID_RE.test(parts[0] ?? "")) return null
  if (!VARIANT_RE.test(parts[1] ?? "")) return null

  let formatStart = -1
  for (let i = parts.length - 3; i >= 2; i--) {
    if (FORMAT_TYPES.includes(parts[i] as (typeof FORMAT_TYPES)[number])) {
      formatStart = i
      break
    }
  }
  if (formatStart === -1) return null

  // Legacy names carry "_" inside angle / CTA; both forms normalise to "-" tokens.
  const angle = toNameToken(parts.slice(2, formatStart).join("_"))
  const format = `${parts[formatStart]}_${parts[formatStart + 1]}`
  const cta = toNameToken(parts.slice(formatStart + 2).join("_"))

  if (!angle || !cta) return null

  const tokens: AdNameTokens = {
    ...(thrmlAdId ? { thrmlAdId } : {}),
    testId: parts[0]!,
    variant: parts[1]!,
    angle,
    format,
    cta,
  }

  try {
    buildAdName(tokens)
  } catch {
    return null
  }
  return tokens
}
