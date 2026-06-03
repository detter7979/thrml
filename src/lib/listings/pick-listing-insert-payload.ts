/** Columns we may set on listings insert (excludes id, timestamps, featured flag). */
export const LISTING_INSERT_COLUMN_KEYS = new Set([
  "host_id",
  "title",
  "description",
  "service_type",
  "session_type",
  "sauna_type",
  "capacity",
  "min_duration_override_minutes",
  "max_duration_override_minutes",
  "min_duration_hours",
  "max_duration_hours",
  "fixed_session_minutes",
  "fixed_session_price",
  "service_duration_min",
  "service_duration_max",
  "service_duration_unit",
  "max_temp",
  "door_operation",
  "access_method",
  "host_availability",
  "emergency_contact",
  "controls_in_reach",
  "has_ventilation",
  "safety_amenities",
  "exterior_devices",
  "has_exterior_devices",
  "private_space_no_devices_attested",
  "private_space_attestation_at",
  "amenities",
  "service_attributes",
  "location",
  "location_address",
  "location_city",
  "location_state",
  "city",
  "state",
  "country",
  "lat",
  "lng",
  "availability",
  "price_solo",
  "price_2",
  "price_3",
  "price_4plus",
  "instant_book",
  "cancellation_policy",
  "house_rules",
  "access_type",
  "access_instructions",
  "check_in_instructions",
  "onsite_contact_name",
  "onsite_contact_phone",
  "is_active",
  "is_draft",
  "is_deleted",
  "parent_listing_id",
])

/** Strips client-only or duplicate keys before insert (e.g. max_temperature, is_instant_book). */
export function pickListingInsertPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const key of LISTING_INSERT_COLUMN_KEYS) {
    if (key in raw) {
      payload[key] = raw[key]
    }
  }
  return payload
}
