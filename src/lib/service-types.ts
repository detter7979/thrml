export const SERVICE_TYPE_IDS = [
  "sauna",
  "cold_plunge",
  "infrared_light",
  "cryotherapy",
  "float_tank",
  "contrast_therapy",
  "pemf",
  "hyperbaric",
] as const

export type ServiceTypeId = (typeof SERVICE_TYPE_IDS)[number]

export type BookingModel = "hourly" | "fixed_session"

export type ServiceTypeMeta = {
  id: ServiceTypeId
  display_name: string
  icon: string
  tagline: string
  booking_model: BookingModel
  health_disclaimer: string | null
}

export const FALLBACK_SERVICE_TYPES: ServiceTypeMeta[] = [
  {
    id: "sauna",
    display_name: "Sauna",
    icon: "🔥",
    tagline: "Heat recovery",
    booking_model: "hourly",
    health_disclaimer: null,
  },
  {
    id: "cold_plunge",
    display_name: "Cold Plunge",
    icon: "🧊",
    tagline: "Boosts recovery",
    booking_model: "fixed_session",
    health_disclaimer: null,
  },
  {
    id: "infrared_light",
    display_name: "Infrared Light",
    icon: "🔴",
    tagline: "Cellular support",
    booking_model: "fixed_session",
    health_disclaimer: null,
  },
  {
    id: "cryotherapy",
    display_name: "Cryotherapy",
    icon: "❄️",
    tagline: "Fast cold session",
    booking_model: "fixed_session",
    health_disclaimer: null,
  },
  {
    id: "float_tank",
    display_name: "Float Tank",
    icon: "🛁",
    tagline: "Deep nervous-system reset",
    booking_model: "fixed_session",
    health_disclaimer: null,
  },
  {
    id: "contrast_therapy",
    display_name: "Contrast Therapy",
    icon: "♨️",
    tagline: "Heat + cold protocol",
    booking_model: "hourly",
    health_disclaimer: null,
  },
  {
    id: "pemf",
    display_name: "PEMF",
    icon: "⚡",
    tagline: "Electromagnetic recovery",
    booking_model: "fixed_session",
    health_disclaimer: null,
  },
  {
    id: "hyperbaric",
    display_name: "Hyperbaric",
    icon: "🫧",
    tagline: "Oxygen optimization",
    booking_model: "fixed_session",
    health_disclaimer: null,
  },
]

export function isServiceTypeId(value: string): value is ServiceTypeId {
  return SERVICE_TYPE_IDS.includes(value as ServiceTypeId)
}

export function getFallbackServiceType(id: string) {
  return FALLBACK_SERVICE_TYPES.find((item) => item.id === id)
}
