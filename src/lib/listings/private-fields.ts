/**
 * Listing columns that are private to the host (and, after booking, the booked guest).
 * The database refuses SELECT on these for anon and authenticated (column privileges, see
 * migrations 20261011030000 / 20261011040000), so session clients must never ask for them,
 * including via select("*"). Read them server-side with the admin client after checking that
 * the caller owns the listing or holds a confirmed booking.
 *
 * Adding a column to `listings`? Column privileges are not inherited: GRANT SELECT (new_col)
 * to anon/authenticated in the same migration if it is public, and add it below.
 */
export const LISTING_PRIVATE_COLUMNS = [
  "location",
  "location_address",
  "exact_lat",
  "exact_lng",
  "access_instructions",
  "check_in_instructions",
  "access_method",
  "door_operation",
  "onsite_contact_name",
  "onsite_contact_phone",
  "emergency_contact",
] as const

/** Every listing column a signed-in or signed-out session may read. Use instead of "*". */
export const LISTING_PUBLIC_COLUMNS =
  "id, host_id, title, description, sauna_type, capacity, max_temp, location_city, location_state, lat, lng, price_solo, price_2, price_3, price_4plus, instant_book, min_duration_hours, max_duration_hours, cancellation_policy, is_active, is_featured, amenities, house_rules, created_at, updated_at, service_type, service_attributes, session_type, fixed_session_minutes, fixed_session_price, availability, is_draft, parent_listing_id, version, deactivated_at, deactivated_reason, min_duration_override_minutes, max_duration_override_minutes, access_type, service_duration_min, service_duration_max, service_duration_unit, city, state, country, is_deleted, deleted_at, health_claim_flagged, health_claim_terms, health_claim_reviewed_at, health_claim_reviewed_by, host_availability, controls_in_reach, has_ventilation, safety_amenities, private_space_no_devices_attested, private_space_attestation_at, has_exterior_devices, exterior_devices"
