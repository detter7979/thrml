/**
 * First-party ad attribution: the UTMs (and click ID) of the visitor's last ad click within 30 days,
 * stamped on the booking at checkout so ROAS can be computed from real bookings by ad ID.
 * Stays on usethrml.com; nothing is sent to a third party.
 */
export const UTM_COOKIE = "thrml_utm"
export const UTM_COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_id", "utm_term", "utm_content"] as const
export const CLICK_ID_KEYS = ["fbclid", "gclid", "gbraid", "wbraid"] as const

export type UtmFields = Partial<Record<(typeof UTM_KEYS)[number] | "click_id", string>>

const clip = (v: string) => v.slice(0, 200)

export function utmFromSearchParams(params: URLSearchParams): UtmFields | null {
  const out: UtmFields = {}
  for (const k of UTM_KEYS) {
    const v = params.get(k)
    if (v) out[k] = clip(v)
  }
  for (const k of CLICK_ID_KEYS) {
    const v = params.get(k)
    if (v) {
      out.click_id = clip(`${k}:${v}`)
      break
    }
  }
  return Object.keys(out).length ? out : null
}

export function parseUtmCookie(raw: string | undefined | null): UtmFields {
  if (!raw) return {}
  try {
    const obj = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>
    const out: UtmFields = {}
    for (const k of [...UTM_KEYS, "click_id"] as const) {
      if (typeof obj[k] === "string" && obj[k]) out[k] = clip(obj[k] as string)
    }
    return out
  } catch {
    return {}
  }
}

/** Columns for the bookings insert (null when absent). */
export function utmBookingColumns(fields: UtmFields) {
  return {
    utm_source: fields.utm_source ?? null,
    utm_medium: fields.utm_medium ?? null,
    utm_campaign: fields.utm_campaign ?? null,
    utm_id: fields.utm_id ?? null,
    utm_term: fields.utm_term ?? null,
    utm_content: fields.utm_content ?? null,
    click_id: fields.click_id ?? null,
  }
}
