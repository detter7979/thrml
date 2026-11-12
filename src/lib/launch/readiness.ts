/**
 * Guest-launch readiness: do we have enough good supply to start driving guests?
 * Criteria agreed 2026-11-12 (ClickUp "Founding host program + launch readiness").
 */

export const LAUNCH_CRITERIA = {
  /** Live listings that pass every per-listing check. */
  minReadyListings: 12,
  /** Target shown to hosts ("X of 15 spaces live"). */
  hostFacingTarget: 15,
  /** Distinct areas, approximated as ~4 km map cells. */
  minAreas: 3,
  /** Space types — informational while the launch is saunas-only. */
  minSpaceTypes: 2,
  minPhotos: 3,
  /** Calendar must be bookable at least one day in each of the next N weeks. */
  openWeeks: 2,
} as const

/** ~0.04° ≈ 4.4 km north–south in Seattle; coarse enough to read as "different neighborhood". */
const AREA_CELL_DEGREES = 0.04

export type ReadinessListing = {
  id: string
  title: string | null
  hostId: string
  serviceType: string | null
  isActive: boolean
  lat: number | null
  lng: number | null
  photoCount: number
  /** Weekly schedule as stored on listings.availability. */
  availability: unknown
  blackoutDates: string[]
}

export type ReadinessHost = {
  id: string
  name: string | null
  idVerified: boolean
  payoutsEnabled: boolean
}

export type ListingCheck = {
  listing: ReadinessListing
  host: ReadinessHost | null
  hasPhotos: boolean
  calendarOpen: boolean
  hostVerified: boolean
  hostPayouts: boolean
  ready: boolean
  area: string | null
}

const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

/** Weekdays (0=Sun) that are enabled in a listing's weekly schedule. */
export function enabledWeekdays(availability: unknown): Set<number> {
  const days = new Set<number>()
  if (!Array.isArray(availability)) return days
  for (const entry of availability) {
    if (!entry || typeof entry !== "object") continue
    const row = entry as { day?: unknown; enabled?: unknown; start?: unknown; end?: unknown }
    if (row.enabled === false) continue
    const index = DAY_KEYS.findIndex((key) => key === row.day)
    if (index === -1) continue
    if (typeof row.start === "string" && typeof row.end === "string" && row.start >= row.end) continue
    days.add(index)
  }
  return days
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** At least one bookable day in each of the next `weeks` weeks (weekly schedule minus blackouts). */
export function calendarOpenForWeeks(input: {
  availability: unknown
  blackoutDates: string[]
  now: Date
  weeks: number
}): boolean {
  const weekdays = enabledWeekdays(input.availability)
  if (weekdays.size === 0) return false
  const blackouts = new Set(input.blackoutDates)
  for (let week = 0; week < input.weeks; week++) {
    let openThisWeek = false
    for (let offset = 0; offset < 7; offset++) {
      const day = new Date(input.now)
      day.setUTCDate(day.getUTCDate() + week * 7 + offset)
      if (weekdays.has(day.getUTCDay()) && !blackouts.has(isoDate(day))) {
        openThisWeek = true
        break
      }
    }
    if (!openThisWeek) return false
  }
  return true
}

export function areaKey(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return `${Math.floor(lat / AREA_CELL_DEGREES)}:${Math.floor(lng / AREA_CELL_DEGREES)}`
}

export type ReadinessReport = {
  checks: ListingCheck[]
  liveCount: number
  readyCount: number
  areaCount: number
  spaceTypes: string[]
  criteria: {
    id: "listings" | "areas" | "spaceTypes" | "hosts" | "quality"
    label: string
    value: string
    met: boolean
    blocking: boolean
  }[]
  readyToLaunch: boolean
}

export function evaluateLaunchReadiness(input: {
  listings: ReadinessListing[]
  hosts: ReadinessHost[]
  now: Date
  saunasOnly: boolean
}): ReadinessReport {
  const hostsById = new Map(input.hosts.map((host) => [host.id, host]))
  const live = input.listings.filter((listing) => listing.isActive)

  const checks: ListingCheck[] = live.map((listing) => {
    const host = hostsById.get(listing.hostId) ?? null
    const hasPhotos = listing.photoCount >= LAUNCH_CRITERIA.minPhotos
    const calendarOpen = calendarOpenForWeeks({
      availability: listing.availability,
      blackoutDates: listing.blackoutDates,
      now: input.now,
      weeks: LAUNCH_CRITERIA.openWeeks,
    })
    const hostVerified = host?.idVerified === true
    const hostPayouts = host?.payoutsEnabled === true
    return {
      listing,
      host,
      hasPhotos,
      calendarOpen,
      hostVerified,
      hostPayouts,
      ready: hasPhotos && calendarOpen && hostVerified && hostPayouts,
      area: areaKey(listing.lat, listing.lng),
    }
  })

  const ready = checks.filter((check) => check.ready)
  const areas = new Set(ready.map((check) => check.area).filter((area): area is string => Boolean(area)))
  const spaceTypes = [...new Set(ready.map((check) => check.listing.serviceType ?? "unknown"))].sort()
  const liveHostIds = new Set(checks.map((check) => check.listing.hostId))
  const hostsComplete = [...liveHostIds].filter((id) => {
    const host = hostsById.get(id)
    return host?.idVerified && host?.payoutsEnabled
  }).length

  const criteria: ReadinessReport["criteria"] = [
    {
      id: "listings",
      label: `${LAUNCH_CRITERIA.minReadyListings}+ ready listings`,
      value: `${ready.length} ready of ${live.length} live`,
      met: ready.length >= LAUNCH_CRITERIA.minReadyListings,
      blocking: true,
    },
    {
      id: "areas",
      label: `${LAUNCH_CRITERIA.minAreas}+ areas across Seattle`,
      value: `${areas.size} area${areas.size === 1 ? "" : "s"}`,
      met: areas.size >= LAUNCH_CRITERIA.minAreas,
      blocking: true,
    },
    {
      id: "hosts",
      label: "Every live host verified with payouts on",
      value: `${hostsComplete} of ${liveHostIds.size} hosts`,
      met: liveHostIds.size > 0 && hostsComplete === liveHostIds.size,
      blocking: false,
    },
    {
      id: "quality",
      label: `Every live listing has ${LAUNCH_CRITERIA.minPhotos}+ photos and an open calendar`,
      value: `${checks.filter((c) => c.hasPhotos && c.calendarOpen).length} of ${live.length} listings`,
      met: live.length > 0 && checks.every((c) => c.hasPhotos && c.calendarOpen),
      blocking: false,
    },
    {
      id: "spaceTypes",
      label: input.saunasOnly
        ? `${LAUNCH_CRITERIA.minSpaceTypes}+ space types (not required while saunas-only)`
        : `${LAUNCH_CRITERIA.minSpaceTypes}+ space types`,
      value: spaceTypes.length ? spaceTypes.join(", ") : "none",
      met: spaceTypes.length >= LAUNCH_CRITERIA.minSpaceTypes,
      blocking: !input.saunasOnly,
    },
  ]

  return {
    checks,
    liveCount: live.length,
    readyCount: ready.length,
    areaCount: areas.size,
    spaceTypes,
    criteria,
    // Only blocking criteria gate launch; listings that fail a quality/host check simply
    // don't count as "ready", so the listing count already reflects them.
    readyToLaunch: criteria.filter((c) => c.blocking).every((c) => c.met),
  }
}
