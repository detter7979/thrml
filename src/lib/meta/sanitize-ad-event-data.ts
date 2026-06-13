/**
 * Strip consumer health data from Meta Pixel / CAPI payloads.
 * Per Consumer Health Data Privacy Policy — do not send wellness-service types
 * (sauna, cold_plunge, etc.) or listing-category fields in ad events.
 */
const BLOCKED_KEYS = new Set([
  "service_type",
  "listing_category",
  "content_category",
  "sauna_type",
  "wellness_type",
  "category",
  "product_type",
  "custom_label_0",
])

export function sanitizeMetaAdEventData(
  data?: Record<string, unknown> | null
): Record<string, unknown> | undefined {
  if (!data || typeof data !== "object") return undefined

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (BLOCKED_KEYS.has(key)) continue
    if (key.toLowerCase().includes("service_type")) continue
    if (key.toLowerCase().includes("listing_category")) continue
    out[key] = value
  }

  return Object.keys(out).length > 0 ? out : undefined
}
