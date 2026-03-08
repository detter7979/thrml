import {
  SERVICE_TYPES as CANONICAL_SERVICE_TYPES,
  getServiceType as getCanonicalServiceType,
  type ServiceType,
} from "@/lib/constants/service-types"

export const SERVICE_TYPE_IDS = CANONICAL_SERVICE_TYPES.map(
  (serviceType) => serviceType.value
) as readonly ServiceType[]

export type ServiceTypeId = ServiceType

export type BookingModel = "hourly" | "fixed_session"

export type ServiceTypeMeta = {
  id: ServiceTypeId
  display_name: string
  icon: string
  tagline: string
  booking_model: BookingModel
  health_disclaimer: string | null
}

const BOOKING_MODEL_BY_SERVICE_TYPE: Record<ServiceType, BookingModel> = {
  sauna: "hourly",
  cold_plunge: "fixed_session",
  hot_tub: "hourly",
  infrared: "fixed_session",
  float_tank: "fixed_session",
  pemf: "fixed_session",
  halotherapy: "fixed_session",
  hyperbaric: "fixed_session",
}

export const FALLBACK_SERVICE_TYPES: ServiceTypeMeta[] = CANONICAL_SERVICE_TYPES.map((serviceType) => ({
  id: serviceType.value,
  display_name: serviceType.label,
  icon: serviceType.emoji,
  tagline: serviceType.description,
  booking_model: BOOKING_MODEL_BY_SERVICE_TYPE[serviceType.value],
  health_disclaimer: null,
}))

export function isServiceTypeId(value: string): value is ServiceTypeId {
  return SERVICE_TYPE_IDS.includes(value as ServiceTypeId)
}

export function getFallbackServiceType(id: string) {
  return FALLBACK_SERVICE_TYPES.find((item) => item.id === id) ??
    (() => {
      const canonical = getCanonicalServiceType(id)
      if (!canonical) return undefined
      return {
        id: canonical.value,
        display_name: canonical.label,
        icon: canonical.emoji,
        tagline: canonical.description,
        booking_model: BOOKING_MODEL_BY_SERVICE_TYPE[canonical.value],
        health_disclaimer: null,
      } satisfies ServiceTypeMeta
    })()
}
