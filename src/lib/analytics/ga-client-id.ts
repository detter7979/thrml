/**
 * Parse GA4 client_id from the _ga cookie for Measurement Protocol.
 * Falls back to `fallback` (e.g. Supabase user id) when cookie is missing or malformed.
 */
export function getGa4ClientIdForMp(fallback: string): string {
  if (typeof document === "undefined") return fallback
  const match = document.cookie.match(/(?:^|;\s*)_ga=([^;]+)/)
  if (!match) return fallback
  try {
    const raw = decodeURIComponent(match[1])
    const parts = raw.split(".")
    if (parts.length >= 4) {
      return `${parts[2]}.${parts[3]}`
    }
  } catch {
    // ignore
  }
  return fallback
}
