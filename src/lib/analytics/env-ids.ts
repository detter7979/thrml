/** Strip wrapping quotes from Vercel/env copy-paste mistakes. */
function stripEnvQuotes(raw: string): string {
  return raw.trim().replace(/^["']+|["']+$/g, "")
}

export function normalizeMetaPixelId(raw?: string | null): string | null {
  const v = raw ? stripEnvQuotes(raw) : ""
  if (!v || v === "null" || v === "undefined") return null
  return /^\d{5,}$/.test(v) ? v : null
}

export function normalizeGoogleAdsId(raw?: string | null): string | null {
  const v = raw ? stripEnvQuotes(raw) : ""
  if (!v || v === "null" || v === "undefined") return null
  return /^AW-\d+$/.test(v) ? v : null
}

export function normalizeGaMeasurementId(raw?: string | null): string | null {
  const v = raw ? stripEnvQuotes(raw) : ""
  if (!v || v === "null" || v === "undefined") return null
  return /^G-[A-Z0-9]+$/.test(v) ? v : null
}
