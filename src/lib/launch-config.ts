import { SERVICE_TYPES, type ServiceType } from "@/lib/constants/service-types"
import type { ServiceTypeMeta } from "@/lib/service-types"

/**
 * When true, only saunas are shown in discovery filters and host create flows.
 * Defaults to on; set NEXT_PUBLIC_SAUNAS_ONLY_LAUNCH=false to show all service types.
 */
export const SAUNAS_ONLY_LAUNCH =
  process.env.NEXT_PUBLIC_SAUNAS_ONLY_LAUNCH !== "false"

export const LAUNCH_VISIBLE_SERVICE_TYPE_IDS: readonly ServiceType[] = SAUNAS_ONLY_LAUNCH
  ? (["sauna"] as const)
  : SERVICE_TYPES.map((serviceType) => serviceType.value)

export function isSaunasOnlyLaunch() {
  return SAUNAS_ONLY_LAUNCH
}

export function isLaunchVisibleServiceType(serviceType: string) {
  if (!SAUNAS_ONLY_LAUNCH) return true
  return serviceType === "sauna"
}

export function getLaunchVisibleServiceTypes() {
  if (!SAUNAS_ONLY_LAUNCH) return SERVICE_TYPES
  return SERVICE_TYPES.filter((serviceType) => serviceType.value === "sauna")
}

export function filterLaunchVisibleServiceTypeMeta(
  items: readonly ServiceTypeMeta[]
): ServiceTypeMeta[] {
  if (!SAUNAS_ONLY_LAUNCH) return [...items]
  return items.filter((item) => item.id === "sauna")
}

export function sanitizeLaunchVisibleServiceTypes(serviceTypes: string[]) {
  if (!SAUNAS_ONLY_LAUNCH) return serviceTypes
  return serviceTypes.filter((serviceType) => serviceType === "sauna")
}

/** Host edit: visible launch types plus the listing's current type if already non-sauna. */
export function getLaunchSelectableServiceTypes(currentServiceType?: string) {
  const visible = getLaunchVisibleServiceTypes()
  if (!currentServiceType || isLaunchVisibleServiceType(currentServiceType)) {
    return visible
  }

  const current = SERVICE_TYPES.find((serviceType) => serviceType.value === currentServiceType)
  return current ? [...visible, current] : visible
}
