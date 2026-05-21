/**
 * Ad name builder for the thrml naming convention.
 *
 * Convention (per thrml_namer_v4):
 *   {testId}_{variant}_{angle}_{format}_{cta}
 *
 * Example:
 *   T05_A_pov_earnings_Video_15s_list_now
 */

export interface AdNameTokens {
  testId: string
  variant: string
  angle: string
  format: string
  cta: string
}

const TEST_ID_RE = /^T\d{2,}$/
const VARIANT_RE = /^[A-D]$/
const TOKEN_RE = /^[a-z0-9_]+$/
const FORMAT_RE = /^(Static|Video|Carousel|GIF)_[a-z0-9x]+$/

const FORMAT_TYPES = ["Static", "Video", "Carousel", "GIF"] as const

export class InvalidAdNameError extends Error {
  constructor(field: string, value: string, reason: string) {
    super(`Invalid ad name token "${field}"="${value}": ${reason}`)
    this.name = "InvalidAdNameError"
  }
}

export function buildAdName(tokens: AdNameTokens): string {
  if (!TEST_ID_RE.test(tokens.testId)) {
    throw new InvalidAdNameError("testId", tokens.testId, 'must match /^T\\d{2,}$/, e.g. "T01"')
  }
  if (!VARIANT_RE.test(tokens.variant)) {
    throw new InvalidAdNameError("variant", tokens.variant, "must be single letter A-D")
  }
  if (!TOKEN_RE.test(tokens.angle)) {
    throw new InvalidAdNameError(
      "angle",
      tokens.angle,
      "must be snake_case (lowercase, digits, underscores)"
    )
  }
  if (!FORMAT_RE.test(tokens.format)) {
    throw new InvalidAdNameError(
      "format",
      tokens.format,
      'must be {Type}_{spec} e.g. "Video_15s", "Static_9x16"'
    )
  }
  if (!TOKEN_RE.test(tokens.cta)) {
    throw new InvalidAdNameError("cta", tokens.cta, "must be snake_case")
  }
  return [tokens.testId, tokens.variant, tokens.angle, tokens.format, tokens.cta].join("_")
}

export function parseAdName(name: string): AdNameTokens | null {
  const parts = name.split("_")
  if (parts.length < 5) return null

  if (!TEST_ID_RE.test(parts[0])) return null
  if (!VARIANT_RE.test(parts[1])) return null

  let formatStart = -1
  for (let i = parts.length - 3; i >= 2; i--) {
    if (FORMAT_TYPES.includes(parts[i] as (typeof FORMAT_TYPES)[number])) {
      formatStart = i
      break
    }
  }
  if (formatStart === -1) return null

  const angle = parts.slice(2, formatStart).join("_")
  const format = `${parts[formatStart]}_${parts[formatStart + 1]}`
  const cta = parts.slice(formatStart + 2).join("_")

  if (!angle || !cta) return null

  const tokens: AdNameTokens = {
    testId: parts[0],
    variant: parts[1],
    angle,
    format,
    cta,
  }

  try {
    if (buildAdName(tokens) !== name) return null
  } catch {
    return null
  }
  return tokens
}
