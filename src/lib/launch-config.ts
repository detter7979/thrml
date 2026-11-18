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

/**
 * Public guest launch (bookings open to everyone). Before this date the site invites guests to
 * join the launch list instead of the general newsletter. Override with
 * NEXT_PUBLIC_GUEST_LAUNCH_DATE (YYYY-MM-DD, Pacific time).
 */
export const GUEST_LAUNCH_DATE = process.env.NEXT_PUBLIC_GUEST_LAUNCH_DATE?.trim() || "2027-01-14"

/** Start of the launch day in Seattle (PST, UTC-8 in winter). */
export function guestLaunchInstant(date: string = GUEST_LAUNCH_DATE): Date {
  const parsed = new Date(`${date}T00:00:00-08:00`)
  return Number.isNaN(parsed.getTime()) ? new Date("2027-01-14T00:00:00-08:00") : parsed
}

export function isGuestPreLaunch(now: Date = new Date(), date: string = GUEST_LAUNCH_DATE): boolean {
  return now.getTime() < guestLaunchInstant(date).getTime()
}

/** "January 14" — for copy like "Bookings open January 14". */
export function guestLaunchLabel(date: string = GUEST_LAUNCH_DATE): string {
  return guestLaunchInstant(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  })
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

/** Hide service-type pills/badges on listing and booking surfaces for now. */
export function showServiceTypeTags() {
  return false
}
