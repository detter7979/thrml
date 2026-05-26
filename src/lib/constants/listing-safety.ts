export const DOOR_OPERATION_OPTIONS = [
  { value: "push_pull_no_lock", label: "Push/pull, no lock" },
  { value: "latch_openable_inside", label: "Latch openable from inside" },
  { value: "other_describe_in_notes", label: "Other (describe in notes)" },
] as const

export const ACCESS_METHOD_OPTIONS = [
  { value: "host_greets_in_person", label: "Host greets in person" },
  { value: "lockbox_keypad", label: "Lockbox / keypad code" },
  { value: "smart_lock", label: "Smart lock" },
  { value: "door_open_no_lock", label: "Door left open / no lock needed" },
  { value: "other", label: "Other" },
] as const

export const HOST_AVAILABILITY_OPTIONS = [
  { value: "on_site_whole_time", label: "On-site the whole time" },
  { value: "on_property_not_present", label: "On the property but not present" },
  { value: "reachable_by_phone", label: "Reachable by phone only" },
  { value: "not_reachable", label: "Not reachable during session" },
] as const

export const SAFETY_AMENITY_OPTIONS = [
  { value: "drinking_water", label: "Drinking water" },
  { value: "first_aid_kit", label: "First-aid kit" },
  { value: "shower_nearby", label: "Shower nearby" },
  { value: "cold_plunge", label: "Cold plunge / cold shower" },
  { value: "towels_provided", label: "Towels provided" },
] as const

export type DoorOperation = (typeof DOOR_OPERATION_OPTIONS)[number]["value"]
export type AccessMethod = (typeof ACCESS_METHOD_OPTIONS)[number]["value"]
export type HostAvailability = (typeof HOST_AVAILABILITY_OPTIONS)[number]["value"]
export type SafetyAmenity = (typeof SAFETY_AMENITY_OPTIONS)[number]["value"]
