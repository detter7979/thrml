import { sanitizeText } from "@/lib/sanitize"

/** Coerce form/API values to shapes Postgres accepts for listings insert. */
export function coerceBooleanField(value: unknown): boolean {
  return value === true || value === "true"
}

export function coerceStringArrayField(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

export function coerceExteriorDevicesField(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  return []
}

export function coerceIsoTimestampOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "string") {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return null
}

function coerceJsonObjectField(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }
  return {}
}

const PAYLOAD_COERCE_KEYS = [
  "exterior_devices",
  "safety_amenities",
  "controls_in_reach",
  "has_ventilation",
  "private_space_no_devices_attested",
  "has_exterior_devices",
  "private_space_attestation_at",
  "service_attributes",
  "amenities",
] as const

/**
 * Normalizes listing insert payload: coerces surveillance/safety fields and strips empty strings on timestamps.
 */
export function normalizeListingInsertPayload(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const payload = { ...raw }

  payload.exterior_devices = coerceExteriorDevicesField(payload.exterior_devices)
  payload.safety_amenities = coerceStringArrayField(payload.safety_amenities)
  payload.controls_in_reach = coerceBooleanField(payload.controls_in_reach)
  payload.has_ventilation = coerceBooleanField(payload.has_ventilation)

  if ("private_space_no_devices_attested" in payload) {
    payload.private_space_no_devices_attested = coerceBooleanField(payload.private_space_no_devices_attested)
  }
  if ("has_exterior_devices" in payload) {
    payload.has_exterior_devices = coerceBooleanField(payload.has_exterior_devices)
  }
  if ("private_space_attestation_at" in payload) {
    payload.private_space_attestation_at = coerceIsoTimestampOrNull(payload.private_space_attestation_at)
  }

  if ("service_attributes" in payload) {
    payload.service_attributes = coerceJsonObjectField(payload.service_attributes)
  }
  if ("amenities" in payload) {
    payload.amenities = coerceStringArrayField(payload.amenities)
  }

  if (!Array.isArray(payload.exterior_devices)) {
    console.warn("[normalizeListingInsertPayload] exterior_devices coerced to []", {
      receivedType: typeof raw.exterior_devices,
    })
    payload.exterior_devices = []
  }

  return payload
}

export function sanitizeHouseRulesForListing(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((rule): rule is string => typeof rule === "string")
    .map((rule) => sanitizeText(rule))
    .filter(Boolean)
}

export function listingPayloadCoerceKeySummary(body: Record<string, unknown> | null) {
  if (!body) return {}
  return Object.fromEntries(
    PAYLOAD_COERCE_KEYS.filter((key) => key in body).map((key) => [key, typeof body[key]])
  )
}
