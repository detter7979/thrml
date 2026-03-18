"use client"

import "mapbox-gl/dist/mapbox-gl.css"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Layers,
  List,
  Map as MapIcon,
  Users,
  X,
} from "lucide-react"
import { motion } from "framer-motion"
import MapboxMap, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapRef,
  type ViewState,
} from "react-map-gl/mapbox"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatServiceType, getServiceType, SERVICE_TYPES } from "@/lib/constants/service-types"
import { trackGaEvent } from "@/lib/analytics/ga"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"

type ViewMode = "split" | "list" | "map"
type SortKey =
  | "recommended"
  | "nearest"
  | "price_low"
  | "price_high"
  | "rating"
  | "newest"

type Filters = {
  serviceTypes: string[]
  priceMin: number
  priceMax: number
  distanceMiles: number
  availableToday: boolean
  instantBook: boolean
  minRating: number | null
  sort: SortKey
}

type Bounds = {
  north: number
  south: number
  east: number
  west: number
} | null

type ListingResult = {
  id: string
  title: string
  serviceType: string
  serviceLabel: string
  serviceIcon: string
  sessionType: "hourly" | "fixed_session"
  lat: number
  lng: number
  locationCity: string
  photoUrl: string | null
  priceSolo: number
  capacity: number
  instantBook: boolean
  amenities: string[]
  rating: number
  reviewCount: number
  isFeatured: boolean
  createdAt: string | null
  distanceMiles: number
  availableToday: boolean
  nextAvailableLabel: string
}

type ServiceOption = {
  id: string
  display_name: string
  icon: string
}

const DEFAULT_CENTER = { lat: 47.6062, lng: -122.3321 }
const DEFAULT_LOCATION_LABEL = "Seattle, WA"
const LAYOUT_PREF_KEY = "thrml:explore-layout"
const PRICE_MAX_ANY = 200
const DISTANCE_ANY = 9999
const DEFAULT_FILTERS: Filters = {
  serviceTypes: [],
  priceMin: 0,
  priceMax: PRICE_MAX_ANY,
  distanceMiles: 50,
  availableToday: false,
  instantBook: false,
  minRating: null,
  sort: "recommended",
}
const NEARBY_FALLBACK_MILES = 150
const TAP_MOVE_THRESHOLD_PX = 10
const SERVICE_COLORS: Record<string, string> = {
  sauna: "#E85D3A",
  cold_plunge: "#3A8BC7",
  hot_tub: "#B27A4A",
  infrared: "#C75B8A",
  float_tank: "#5B7AC7",
  pemf: "#C7A83A",
  hyperbaric: "#3AC76B",
  halotherapy: "#C7C73A",
}

function hasPublishedRating(reviewCount: number, rating: number) {
  return reviewCount >= 1 && Number.isFinite(rating)
}

const LISTINGS_SELECT_PRIMARY =
  "id, title, service_type, session_type, lat, lng, location_city, city, listing_photos(url, order_index), price_solo, fixed_session_price, capacity, instant_book, amenities, is_featured, created_at, availability, listing_ratings(avg_overall, review_count)"
const LISTINGS_SELECT_NO_RATINGS =
  "id, title, service_type, session_type, lat, lng, location_city, city, listing_photos(url, order_index), price_solo, fixed_session_price, capacity, instant_book, amenities, is_featured, created_at, availability"
const LISTINGS_SELECT_LEGACY =
  "id, title, service_type, session_type, lat, lng, city, location, listing_photos(url, order_index), price_solo, price_2, price_3, price_4plus, capacity, is_featured, created_at, instant_book, amenities"
const LISTINGS_SELECT_MINIMAL =
  "id, title, service_type, session_type, lat, lng, city, location, price_solo, price_2, is_featured, created_at"

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 3959 * (2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)))
}

function parseFiniteNumber(value: string | null, fallback: number) {
  if (value === null) return fallback
  if (value.trim() === "") return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function areFiltersEqual(left: Filters, right: Filters) {
  return (
    areStringArraysEqual(left.serviceTypes, right.serviceTypes) &&
    left.priceMin === right.priceMin &&
    left.priceMax === right.priceMax &&
    left.distanceMiles === right.distanceMiles &&
    left.availableToday === right.availableToday &&
    left.instantBook === right.instantBook &&
    left.minRating === right.minRating &&
    left.sort === right.sort
  )
}

function resolveListingPhotoUrl(
  supabase: ReturnType<typeof createClient>,
  raw: unknown
) {
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed
  const normalizedPath = trimmed
    .replace(/^\/+/, "")
    .replace(/^listing-photos\//, "")
  const { data } = supabase.storage
    .from("listing-photos")
    .getPublicUrl(normalizedPath)
  return data.publicUrl || null
}

function getBounds(centerLat: number, centerLng: number, radiusMiles: number) {
  const delta = radiusMiles / 69
  return {
    north: centerLat + delta,
    south: centerLat - delta,
    east: centerLng + delta / Math.cos((centerLat * Math.PI) / 180),
    west: centerLng - delta / Math.cos((centerLat * Math.PI) / 180),
  }
}

function normalizeDayIndex(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0 && value <= 6) return value
    if (value >= 1 && value <= 7) return value % 7
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    const aliases: Record<string, number> = {
      sun: 0,
      sunday: 0,
      mon: 1,
      monday: 1,
      tue: 2,
      tues: 2,
      tuesday: 2,
      wed: 3,
      wednesday: 3,
      thu: 4,
      thur: 4,
      thurs: 4,
      thursday: 4,
      fri: 5,
      friday: 5,
      sat: 6,
      saturday: 6,
    }
    if (normalized in aliases) return aliases[normalized]
    const asNumber = Number(normalized)
    if (Number.isFinite(asNumber)) return normalizeDayIndex(asNumber)
  }
  return null
}

function asBoolean(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true") return true
    if (normalized === "false") return false
    if (normalized === "1") return true
    if (normalized === "0") return false
  }
  if (typeof value === "number") {
    if (value === 1) return true
    if (value === 0) return false
  }
  return fallback
}

function nextAvailableLabel(value: unknown) {
  if (!Array.isArray(value)) return "Next: TBD"
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const today = new Date().getDay()
  for (let offset = 1; offset < 8; offset += 1) {
    const day = (today + offset) % 7
    const match = value.find((row) => {
      if (typeof row !== "object" || !row) return false
      const item = row as Record<string, unknown>
      return (
        normalizeDayIndex(item.day_of_week ?? item.dayIndex ?? item.day) === day &&
        asBoolean(item.is_available ?? item.enabled, true)
      )
    })
    if (match) return `Next: ${days[day]}`
  }
  return "Next: TBD"
}

function isAvailableToday(value: unknown) {
  if (!Array.isArray(value)) return false
  const today = new Date().getDay()
  return value.some((row) => {
    if (typeof row !== "object" || !row) return false
    const item = row as Record<string, unknown>
    return (
      normalizeDayIndex(item.day_of_week ?? item.dayIndex ?? item.day) === today &&
      asBoolean(item.is_available ?? item.enabled, true)
    )
  })
}

function serviceEmoji(type: string) {
  return getServiceType(type)?.emoji ?? "🔥"
}

function sortListings(items: ListingResult[], sort: SortKey) {
  const clone = [...items]
  if (sort === "nearest") clone.sort((a, b) => a.distanceMiles - b.distanceMiles)
  if (sort === "price_low") clone.sort((a, b) => a.priceSolo - b.priceSolo)
  if (sort === "price_high") clone.sort((a, b) => b.priceSolo - a.priceSolo)
  if (sort === "rating") clone.sort((a, b) => b.rating - a.rating)
  if (sort === "newest")
    clone.sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    )
  if (sort === "recommended") {
    clone.sort((a, b) => {
      if (a.isFeatured !== b.isFeatured) return Number(b.isFeatured) - Number(a.isFeatured)
      return b.rating - a.rating
    })
  }
  return clone
}

export function ExploreClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const mapRef = useRef<MapRef | null>(null)
  const listRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const mobileMapCardsRef = useRef<HTMLDivElement | null>(null)
  const mapCardTapRef = useRef<{
    pointerId: number | null
    startX: number
    startY: number
    suppressClick: boolean
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    suppressClick: false,
  })
  const hasTrackedSearchRef = useRef(false)
  const [isMobile, setIsMobile] = useState(false)
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  const initialCenter = useMemo(
    () => ({
      lat: parseFiniteNumber(searchParams.get("lat"), DEFAULT_CENTER.lat),
      lng: parseFiniteNumber(searchParams.get("lng"), DEFAULT_CENTER.lng),
    }),
    [searchParams]
  )

  const initialFilters = useMemo<Filters>(() => {
    const fromService = searchParams.get("service")
    const fromSingle = searchParams.get("service_type")
    const rawServices = fromService ?? fromSingle ?? ""
    const distanceParam = searchParams.get("distance")
    const parsedDistance =
      distanceParam === "any"
        ? DISTANCE_ANY
        : parseFiniteNumber(distanceParam, DEFAULT_FILTERS.distanceMiles)
    const parsedSort = searchParams.get("sort") as SortKey | null
    const minRatingParam = searchParams.get("min_rating")
    const parsedMinRating = minRatingParam
      ? parseFiniteNumber(minRatingParam, DEFAULT_FILTERS.minRating ?? 0)
      : null
    const legacyRating45 = searchParams.get("rating45") === "true"
    return {
      serviceTypes: rawServices
        ? rawServices
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
      priceMin: parseFiniteNumber(searchParams.get("price_min"), DEFAULT_FILTERS.priceMin),
      priceMax: parseFiniteNumber(searchParams.get("price_max"), DEFAULT_FILTERS.priceMax),
      distanceMiles: Number.isFinite(parsedDistance) ? parsedDistance : DEFAULT_FILTERS.distanceMiles,
      availableToday: searchParams.get("available_today") === "true",
      instantBook: searchParams.get("instant_book") === "true",
      minRating: parsedMinRating !== null ? parsedMinRating : legacyRating45 ? 4.5 : null,
      sort: parsedSort ?? DEFAULT_FILTERS.sort,
    }
  }, [searchParams])

  const initialLocation = useMemo(() => {
    const paramLocation = searchParams.get("location")
    const hasLatLng = Boolean(searchParams.get("lat") && searchParams.get("lng"))
    if (paramLocation === "Near me" && !hasLatLng) return DEFAULT_LOCATION_LABEL
    return paramLocation ?? DEFAULT_LOCATION_LABEL
  }, [searchParams])
  const [locationLabel, setLocationLabel] = useState(initialLocation)
  const urlViewMode = useMemo(() => {
    const paramView = searchParams.get("view")
    if (paramView === "split" || paramView === "list" || paramView === "map") return paramView
    return null
  }, [searchParams])
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const paramView = searchParams.get("view") as ViewMode | null
    const saved =
      typeof window !== "undefined" ? (localStorage.getItem(LAYOUT_PREF_KEY) as ViewMode | null) : null
    return (paramView ?? saved ?? (isMobile ? "list" : "split")) as ViewMode
  })
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [listings, setListings] = useState<ListingResult[]>([])
  const [nearbyListings, setNearbyListings] = useState<ListingResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeSource, setActiveSource] = useState<"hover" | "pin" | null>(null)
  const [openFilter, setOpenFilter] = useState<null | "service" | "price" | "distance">(null)
  const [center, setCenter] = useState(initialCenter)
  const [searchCenter, setSearchCenter] = useState(initialCenter)
  const [originCenter, setOriginCenter] = useState(initialCenter)
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [sheetDrag, setSheetDrag] = useState(0)
  const [dragStartY, setDragStartY] = useState<number | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const serviceTypeOptions = useMemo<ServiceOption[]>(
    () =>
      SERVICE_TYPES.map((serviceType) => ({
        id: serviceType.value,
        display_name: serviceType.label,
        icon: serviceType.emoji,
      })),
    []
  )
  const [serviceDraft, setServiceDraft] = useState<string[]>(initialFilters.serviceTypes)
  const currentExploreUrl = useMemo(() => {
    const params = searchParams.toString()
    return params ? `${pathname}?${params}` : pathname
  }, [pathname, searchParams])

  useEffect(() => {
    setCenter((current) =>
      current.lat === initialCenter.lat && current.lng === initialCenter.lng
        ? current
        : initialCenter
    )
    setSearchCenter((current) =>
      current.lat === initialCenter.lat && current.lng === initialCenter.lng
        ? current
        : initialCenter
    )
    setOriginCenter((current) =>
      current.lat === initialCenter.lat && current.lng === initialCenter.lng
        ? current
        : initialCenter
    )
    setLocationLabel((current) => (current === initialLocation ? current : initialLocation))
    setFilters((current) => (areFiltersEqual(current, initialFilters) ? current : initialFilters))
    setServiceDraft((current) =>
      areStringArraysEqual(current, initialFilters.serviceTypes)
        ? current
        : initialFilters.serviceTypes
    )
    if (urlViewMode) {
      setViewMode((current) => (urlViewMode === current ? current : urlViewMode))
    }
  }, [initialCenter, initialFilters, initialLocation, urlViewMode])

  const serviceMetaMap = useMemo(
    () => new Map(serviceTypeOptions.map((item) => [item.id, item])),
    [serviceTypeOptions]
  )
  const modeListings =
    viewMode === "list" ? listings : listings.length ? listings : nearbyListings
  const showingNearbyFallback =
    viewMode !== "list" &&
    listings.length === 0 &&
    nearbyListings.length > 0 &&
    filters.distanceMiles < DISTANCE_ANY
  const resultCountLabel = `${modeListings.length} spaces near ${locationLabel}`
  const shouldShowSearchArea =
    haversineMiles(center.lat, center.lng, originCenter.lat, originCenter.lng) > 0.7
  const useClusters = modeListings.length > 50
  const activeFilterCount = [
    filters.serviceTypes.length > 0,
    filters.priceMin > DEFAULT_FILTERS.priceMin || filters.priceMax < DEFAULT_FILTERS.priceMax,
    filters.distanceMiles !== DEFAULT_FILTERS.distanceMiles,
    filters.availableToday,
    filters.instantBook,
    filters.minRating !== null,
  ].filter(Boolean).length

  const queryBounds: Bounds = useMemo(() => {
    if (filters.distanceMiles >= DISTANCE_ANY) return null
    return getBounds(searchCenter.lat, searchCenter.lng, filters.distanceMiles)
  }, [filters.distanceMiles, searchCenter.lat, searchCenter.lng])

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function buildQuery(
    supabase: ReturnType<typeof createClient>,
    currentFilters: Filters,
    bounds: Bounds,
    selectClause: string,
    options?: { supportsPriceFilter?: boolean }
  ) {
    const supportsPriceFilter = options?.supportsPriceFilter ?? true
    let query = supabase
      .from("listings")
      .select(selectClause)
      .eq("is_active", true)
      .eq("is_deleted", false)
      .order("is_featured", { ascending: false })
      .limit(120)

    if (bounds) {
      query = query
        .gte("lat", bounds.south)
        .lte("lat", bounds.north)
        .gte("lng", bounds.west)
        .lte("lng", bounds.east)
    }
    if (currentFilters.serviceTypes.length > 0) {
      query = query.in("service_type", currentFilters.serviceTypes)
    }
    if (supportsPriceFilter && currentFilters.priceMin > 0)
      query = query.gte("price_solo", currentFilters.priceMin)
    if (supportsPriceFilter && currentFilters.priceMax < PRICE_MAX_ANY)
      query = query.lte("price_solo", currentFilters.priceMax)
    return query
  }

  function distanceLabel() {
    if (filters.distanceMiles >= DISTANCE_ANY) return "Any distance ▾"
    return `Within ${filters.distanceMiles} mi ▾`
  }

  function priceLabel() {
    if (filters.priceMin === 0 && filters.priceMax === PRICE_MAX_ANY) return "Price ▾"
    if (filters.priceMin === 0) return `Price: Under $${filters.priceMax} ▾`
    if (filters.priceMax === PRICE_MAX_ANY) return `Price: $${filters.priceMin}+ ▾`
    return `Price: $${filters.priceMin}–$${filters.priceMax} ▾`
  }

  function priceValueLabel() {
    if (filters.priceMax === PRICE_MAX_ANY) return `$${filters.priceMin}+ per person`
    return `$${filters.priceMin} - $${filters.priceMax} per person`
  }
  const priceMinPct = (filters.priceMin / PRICE_MAX_ANY) * 100
  const priceMaxPct = (filters.priceMax / PRICE_MAX_ANY) * 100

  function distanceToZoom(distanceMiles: number) {
    if (distanceMiles <= 1) return 13
    if (distanceMiles <= 2) return 12
    if (distanceMiles <= 5) return 11
    if (distanceMiles <= 10) return 10
    if (distanceMiles <= 25) return 9
    if (distanceMiles <= 50) return 8
    if (distanceMiles >= DISTANCE_ANY) return 7
    return 9
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    const media = window.matchMedia("(max-width: 767px)")
    const sync = () => setIsMobile(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LAYOUT_PREF_KEY, viewMode)
    }
  }, [viewMode])

  useEffect(() => {
    if (!isMobile || viewMode !== "split") return
    setViewMode("list")
  }, [isMobile, viewMode])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set("location", locationLabel)
    params.set("lat", searchCenter.lat.toFixed(5))
    params.set("lng", searchCenter.lng.toFixed(5))
    if (filters.serviceTypes.length) params.set("service", filters.serviceTypes.join(","))
    if (filters.priceMin > 0) params.set("price_min", String(filters.priceMin))
    if (filters.priceMax < DEFAULT_FILTERS.priceMax) params.set("price_max", String(filters.priceMax))
    if (filters.distanceMiles !== DEFAULT_FILTERS.distanceMiles) params.set("distance", String(filters.distanceMiles))
    if (filters.availableToday) params.set("available_today", "true")
    if (filters.instantBook) params.set("instant_book", "true")
    if (filters.minRating) params.set("min_rating", String(filters.minRating))
    if (filters.sort !== "recommended") params.set("sort", filters.sort)
    params.set("view", viewMode)
    router.replace(`/explore?${params.toString()}`, { scroll: false })
  }, [
    filters,
    locationLabel,
    router,
    searchCenter.lat,
    searchCenter.lng,
    viewMode,
  ])

  useEffect(() => {
    const zoom = distanceToZoom(filters.distanceMiles)
    mapRef.current?.flyTo({
      center: [searchCenter.lng, searchCenter.lat],
      zoom,
    })
  }, [filters.distanceMiles, searchCenter.lat, searchCenter.lng])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      const supabase = createClient()

      async function fetchListings() {
        setLoading(true)
        setError(null)
        async function hydratePhotoUrls(items: ListingResult[]) {
          const missingPhotoIds = items
            .filter((item) => !item.photoUrl)
            .map((item) => item.id)
          if (!missingPhotoIds.length) return items

          const { data: photosRows, error: photosError } = await supabase
            .from("listing_photos")
            .select("listing_id, url, order_index")
            .in("listing_id", missingPhotoIds)

          if (photosError) {
            console.warn("[Explore] photo backfill failed", photosError)
            return items
          }

          const bestByListing = new Map<string, string>()
          const grouped = new Map<
            string,
            Array<{ url?: string | null; order_index?: number | null }>
          >()
          for (const row of (photosRows ?? []) as Array<{
            listing_id?: string | null
            url?: string | null
            order_index?: number | null
          }>) {
            if (!row.listing_id) continue
            const list = grouped.get(row.listing_id) ?? []
            list.push(row)
            grouped.set(row.listing_id, list)
          }

          for (const [listingId, photos] of grouped.entries()) {
            const sorted = [...photos].sort(
              (a, b) => (a.order_index ?? 999) - (b.order_index ?? 999)
            )
            const best = sorted.find((photo) => typeof photo.url === "string" && photo.url)
            const resolved = resolveListingPhotoUrl(supabase, best?.url ?? null)
            if (resolved) bestByListing.set(listingId, resolved)
          }

          return items.map((item) => ({
            ...item,
            photoUrl: item.photoUrl ?? bestByListing.get(item.id) ?? null,
          }))
        }

        async function runSearch(bounds: Bounds) {
          const selectFallbacks = [
            { select: LISTINGS_SELECT_PRIMARY, supportsPriceFilter: true },
            { select: LISTINGS_SELECT_NO_RATINGS, supportsPriceFilter: true },
            { select: LISTINGS_SELECT_LEGACY, supportsPriceFilter: true },
            { select: LISTINGS_SELECT_MINIMAL, supportsPriceFilter: false },
          ]
          let lastError: unknown = null

          for (const variant of selectFallbacks) {
            const { data, error: searchError } = await buildQuery(
              supabase,
              filters,
              bounds,
              variant.select,
              { supportsPriceFilter: variant.supportsPriceFilter }
            )
            if (!searchError) {
              const rawRows: unknown[] = Array.isArray(data) ? (data as unknown[]) : []
              return {
                data: rawRows.filter(
                  (row): row is Record<string, unknown> =>
                    typeof row === "object" && row !== null && !Array.isArray(row)
                ),
                usedFallback: variant.select !== LISTINGS_SELECT_PRIMARY,
              }
            }
            lastError = searchError
          }

          return {
            data: [] as Record<string, unknown>[],
            usedFallback: true,
            error: lastError,
          }
        }

        const searchResult = await runSearch(queryBounds)
        if (cancelled) return

        if (searchResult.error) {
          const detailedError =
            typeof searchResult.error === "object" && searchResult.error
              ? {
                  message: (searchResult.error as { message?: string }).message,
                  details: (searchResult.error as { details?: string }).details,
                  hint: (searchResult.error as { hint?: string }).hint,
                  code: (searchResult.error as { code?: string }).code,
                }
              : searchResult.error
          console.error("[Explore] listings query failed", detailedError)
          setError("Couldn't load spaces. Try adjusting your filters.")
          setListings([])
          setNearbyListings([])
          setLoading(false)
          return
        }
        if (searchResult.usedFallback) {
          console.warn("[Explore] using fallback listing select for compatibility")
        }

        const mapRows = (rows: Record<string, unknown>[]) =>
          rows
            .map((row) => {
              const serviceType = typeof row.service_type === "string" ? row.service_type : "sauna"
              const meta = serviceMetaMap.get(serviceType)
              const lat = Number(row.lat ?? 0)
              const lng = Number(row.lng ?? 0)
              const distanceMiles = haversineMiles(searchCenter.lat, searchCenter.lng, lat, lng)
              const ratingsValue = row.listing_ratings
              const ratingRow = Array.isArray(ratingsValue)
                ? (ratingsValue[0] as Record<string, unknown> | undefined)
                : typeof ratingsValue === "object" && ratingsValue
                  ? (ratingsValue as Record<string, unknown>)
                  : undefined

              return {
                id: String(row.id ?? crypto.randomUUID()),
                title: typeof row.title === "string" ? row.title : "thrml listing",
                serviceType,
                serviceLabel: meta?.display_name ?? formatServiceType(serviceType),
                serviceIcon: meta?.icon ?? serviceEmoji(serviceType),
                sessionType:
                  row.session_type === "fixed_session" || serviceType === "infrared"
                    ? "fixed_session"
                    : "hourly",
                lat,
                lng,
                locationCity:
                  (typeof row.location_city === "string" && row.location_city) ||
                  (typeof row.city === "string" && row.city) ||
                  "City",
                photoUrl:
                  Array.isArray(row.listing_photos)
                    ? (() => {
                        const sorted = [...(row.listing_photos as Array<{ url?: string; order_index?: number }>)].sort(
                          (a, b) => (a.order_index ?? 999) - (b.order_index ?? 999)
                        )
                        const best = sorted.find(
                          (photo) => typeof photo?.url === "string" && photo.url
                        )
                        return resolveListingPhotoUrl(supabase, best?.url ?? null)
                      })()
                    : resolveListingPhotoUrl(
                        supabase,
                        (row as Record<string, unknown>).cover_photo_url ??
                          (row as Record<string, unknown>).photo_url ??
                          null
                      ),
                priceSolo: Number(
                  row.price_solo ?? row.fixed_session_price ?? row.price_2 ?? row.price_3 ?? 0
                ),
                capacity: Number(row.capacity ?? 1),
                instantBook: asBoolean(row.instant_book, false),
                amenities: Array.isArray(row.amenities)
                  ? row.amenities.filter((a): a is string => typeof a === "string")
                  : [],
                rating: Number(ratingRow?.avg_overall ?? ratingRow?.avg_rating ?? 0),
                reviewCount: Number(ratingRow?.review_count ?? 0),
                isFeatured: Boolean(row.is_featured),
                createdAt: typeof row.created_at === "string" ? row.created_at : null,
                distanceMiles,
                availableToday: isAvailableToday(row.availability),
                nextAvailableLabel: nextAvailableLabel(row.availability),
              } satisfies ListingResult
            })
            .filter((item) => item.lat !== 0 && item.lng !== 0)

        const applyClientFilters = (items: ListingResult[]) => {
          const withAvailability = filters.availableToday
            ? items.filter((item) => item.availableToday)
            : items
          const withInstantBook = filters.instantBook
            ? withAvailability.filter((item) => item.instantBook)
            : withAvailability
          const withRating = filters.minRating
            ? withInstantBook.filter((item) => item.rating >= filters.minRating!)
            : withInstantBook
          return sortListings(withRating, filters.sort)
        }

        const strictResults = applyClientFilters(
          mapRows(searchResult.data)
        )
        const strictWithPhotos = await hydratePhotoUrls(strictResults)
        if (cancelled) return
        setListings(strictWithPhotos)

        if (strictWithPhotos.length > 0 || filters.distanceMiles >= DISTANCE_ANY) {
          setNearbyListings([])
          setLoading(false)
          return
        }

        const fallbackBounds = getBounds(
          searchCenter.lat,
          searchCenter.lng,
          NEARBY_FALLBACK_MILES
        )
        const fallbackResult = await runSearch(fallbackBounds)
        if (cancelled) return

        if (fallbackResult.error) {
          console.warn("[Explore] fallback query failed", fallbackResult.error)
          setNearbyListings([])
          setLoading(false)
          return
        }

        const strictIds = new Set(strictWithPhotos.map((item) => item.id))
        const nearby = applyClientFilters(
          mapRows(fallbackResult.data).filter(
            (item) => !strictIds.has(item.id)
          )
        )
        const nearbyWithPhotos = await hydratePhotoUrls(nearby)
        if (cancelled) return
        setNearbyListings(nearbyWithPhotos)
        setLoading(false)
      }

      void fetchListings()
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [filters, queryBounds, searchCenter.lat, searchCenter.lng, serviceMetaMap])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!hasTrackedSearchRef.current) {
        hasTrackedSearchRef.current = true
        return
      }
      trackGaEvent("search", {
        search_term: locationLabel,
        service_type: filters.serviceTypes.length === 1 ? filters.serviceTypes[0] : "all",
        results_count: modeListings.length,
      })
    }, 500)

    return () => window.clearTimeout(timer)
  }, [filters, locationLabel, modeListings.length])

  const activeListing = modeListings.find((item) => item.id === activeId) ?? null
  const popupListing = activeSource === "pin" ? activeListing : null

  function toggleServiceTypeDraft(serviceType: string) {
    setServiceDraft((current) =>
      current.includes(serviceType)
        ? current.filter((value) => value !== serviceType)
        : [...current, serviceType]
    )
  }

  function serviceChipLabel() {
    if (!filters.serviceTypes.length) return "Service Type ▾"
    const first = filters.serviceTypes[0]
    const firstIcon = serviceMetaMap.get(first)?.icon ?? serviceEmoji(first)
    if (filters.serviceTypes.length === 1) return `${firstIcon} ${serviceMetaMap.get(first)?.display_name ?? first} ▾`
    return `${firstIcon} +${filters.serviceTypes.length} ▾`
  }

  useEffect(() => {
    if (!activeId || activeSource !== "pin") return
    const node = listRefs.current.get(activeId)
    node?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [activeId, activeSource])

  function onMapMoveEnd(view: ViewState) {
    setCenter({ lat: view.latitude, lng: view.longitude })
  }

  function mapGeoJson() {
    return {
      type: "FeatureCollection",
      features: modeListings.map((item) => ({
        type: "Feature",
        properties: {
          id: item.id,
          price: `$${Math.round(item.priceSolo)}`,
        },
        geometry: { type: "Point", coordinates: [item.lng, item.lat] },
      })),
    } as const
  }

  function beginMapCardTap(pointerId: number, x: number, y: number) {
    mapCardTapRef.current = { pointerId, startX: x, startY: y, suppressClick: false }
  }

  function trackMapCardTap(pointerId: number, x: number, y: number) {
    const tap = mapCardTapRef.current
    if (tap.pointerId !== pointerId || tap.suppressClick) return
    const deltaX = x - tap.startX
    const deltaY = y - tap.startY
    if (Math.hypot(deltaX, deltaY) > TAP_MOVE_THRESHOLD_PX) {
      tap.suppressClick = true
    }
  }

  function releaseMapCardTap(pointerId?: number) {
    const tap = mapCardTapRef.current
    if (typeof pointerId === "number" && tap.pointerId !== pointerId) return
    mapCardTapRef.current.pointerId = null
  }

  function clearMapCardTap(pointerId?: number) {
    const tap = mapCardTapRef.current
    if (typeof pointerId === "number" && tap.pointerId !== pointerId) return
    mapCardTapRef.current = { pointerId: null, startX: 0, startY: 0, suppressClick: false }
  }

  function openListingFromCard(listingId: string) {
    router.push(`/listings/${listingId}?from=${encodeURIComponent(currentExploreUrl)}`)
  }

  const mapPanel = (
    <div className="relative h-full w-full">
      <MapboxMap
        ref={mapRef}
        mapboxAccessToken={token}
        initialViewState={{ latitude: center.lat, longitude: center.lng, zoom: 12 }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        onClick={() => {
          setActiveId(null)
          setActiveSource(null)
        }}
        onMoveEnd={(event) => {
          onMapMoveEnd(event.viewState)
        }}
      >
        <NavigationControl position="top-right" />

        <div className="absolute top-3 left-3 z-20">
          <button
            type="button"
            onClick={() => {
              if (!navigator.geolocation) {
                setGeoError("Location is unavailable in this browser.")
                return
              }
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  const next = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                  }
                  setGeoError(null)
                  setLocationLabel("Near me")
                  setCenter(next)
                  setSearchCenter(next)
                  setOriginCenter(next)
                  mapRef.current?.flyTo({ center: [next.lng, next.lat], zoom: 12 })
                },
                () => {
                  setGeoError("Couldn’t access your location. Check browser permissions.")
                },
                { enableHighAccuracy: true, timeout: 10000 }
              )
            }}
            className="rounded-full bg-white px-3 py-2 text-sm shadow"
          >
            📍 Recenter
          </button>
          {geoError ? <p className="mt-2 rounded bg-white px-2 py-1 text-xs text-rose-600 shadow">{geoError}</p> : null}
        </div>

        {shouldShowSearchArea ? (
          <div className="absolute right-3 bottom-4 z-20">
            <button
              type="button"
              onClick={() => {
                setOriginCenter(center)
                setSearchCenter(center)
              }}
              className="rounded-full bg-[#C75B3A] px-4 py-2 text-sm text-white shadow"
            >
              Search this area
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="pointer-events-none absolute inset-0 z-10">
            {new Array(8).fill(null).map((_, i) => (
              <span
                key={i}
                className="absolute size-4 animate-pulse rounded-full bg-zinc-300/70"
                style={{ left: `${12 + ((i * 11) % 70)}%`, top: `${18 + ((i * 9) % 60)}%` }}
              />
            ))}
          </div>
        ) : null}

        {useClusters ? (
          <Source
            id="explore-points"
            type="geojson"
            data={mapGeoJson() as never}
            cluster
            clusterRadius={45}
          >
            <Layer
              id="clusters"
              type="circle"
              filter={["has", "point_count"]}
              paint={{ "circle-color": "#C75B3A", "circle-radius": 20 }}
            />
            <Layer
              id="cluster-count"
              type="symbol"
              filter={["has", "point_count"]}
              layout={{ "text-field": "{point_count_abbreviated}", "text-size": 12 }}
              paint={{ "text-color": "#ffffff" }}
            />
            <Layer
              id="unclustered"
              type="circle"
              filter={["!", ["has", "point_count"]]}
              paint={{ "circle-color": "#1A1410", "circle-radius": 6 }}
            />
          </Source>
        ) : (
          modeListings.slice(0, 50).map((item) => {
            const isHovered = activeId === item.id && activeSource === "hover"
            const isActive = activeId === item.id && activeSource === "pin"
            return (
              <Marker
                key={item.id}
                longitude={item.lng}
                latitude={item.lat}
                anchor="bottom"
                style={{ zIndex: isActive ? 50 : isHovered ? 20 : 1 }}
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setActiveId(item.id)
                    setActiveSource("pin")
                  }}
                  className={`rounded-full px-2.5 py-1.5 text-[13px] transition-all ${
                    isActive
                      ? "z-20 scale-[1.15] bg-[#C75B3A] text-white"
                      : isHovered
                        ? "z-20 scale-110 bg-[#B44D31] text-white"
                        : "bg-white text-[#2C2420]"
                  }`}
                  style={{
                    border: isActive || isHovered ? "none" : "1px solid #E5DDD6",
                    boxShadow: isActive ? "0 2px 8px rgba(139,69,19,0.35)" : "none",
                  }}
                >
                  <span
                    className="mr-1 inline-block size-2 rounded-full"
                    style={{ backgroundColor: SERVICE_COLORS[item.serviceType] ?? "#E85D3A" }}
                  />
                  ${Math.round(item.priceSolo)}
                </button>
              </Marker>
            )
          })
        )}

        {popupListing ? (
          <Popup
            longitude={popupListing.lng}
            latitude={popupListing.lat}
            anchor="top"
            closeButton={false}
            offset={28}
            onClose={() => {
              setActiveId(null)
              setActiveSource(null)
            }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => openListingFromCard(popupListing.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  openListingFromCard(popupListing.id)
                }
              }}
              className="relative w-[220px] overflow-hidden rounded-xl bg-white text-left shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  event.preventDefault()
                  setActiveId(null)
                  setActiveSource(null)
                }}
                className="absolute top-2 right-2 z-10 rounded-full bg-white/90 p-1"
              >
                <X className="size-3" />
              </button>
              <div className="relative h-[120px] w-full">
                {popupListing.photoUrl ? (
                  <Image src={popupListing.photoUrl} alt={popupListing.title} fill className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center bg-[#F3E7DC] text-2xl">
                    {popupListing.serviceIcon}
                  </div>
                )}
              </div>
              <div className="space-y-1 p-3 text-xs">
                <p className="line-clamp-1 font-serif text-[13px]">{popupListing.title}</p>
                <p className="text-muted-foreground">
                  {hasPublishedRating(popupListing.reviewCount, popupListing.rating)
                    ? `★ ${popupListing.rating.toFixed(1)} (${popupListing.reviewCount})`
                    : "New"}{" "}
                  · {popupListing.serviceLabel} · {popupListing.distanceMiles.toFixed(1)} mi
                </p>
                <p className="font-medium text-[#C75B3A]">
                  ${Math.round(popupListing.priceSolo)}{" "}
                  {popupListing.sessionType === "fixed_session" ? "/session" : "/pp/hr"}
                </p>
              </div>
            </div>
          </Popup>
        ) : null}
      </MapboxMap>
    </div>
  )

  const listCard = (listing: ListingResult, large = false) => {
    const active = listing.id === activeId
    return (
      <div
        key={listing.id}
        ref={(node) => {
          if (node) listRefs.current.set(listing.id, node)
          else listRefs.current.delete(listing.id)
        }}
        onMouseEnter={() => {
          if (activeSource === "pin") return
          setActiveId(listing.id)
          setActiveSource("hover")
        }}
        onMouseLeave={() => {
          setActiveId((prev) => {
            if (activeSource === "hover" && prev === listing.id) return null
            return prev
          })
          setActiveSource((prev) => (prev === "hover" ? null : prev))
        }}
        onClick={() => {
          router.push(`/listings/${listing.id}?from=${encodeURIComponent(currentExploreUrl)}`)
        }}
        className={cn(
          "group cursor-pointer rounded-2xl border border-transparent bg-white p-3 shadow-[0_6px_16px_rgba(26,20,16,0.06)] transition-all duration-150",
          active && [
            "border-[#E9DFD3]",
            "bg-[#FCFAF7]",
            "shadow-[0_4px_18px_rgba(26,20,16,0.10)]",
            "z-10 relative",
          ],
          !active && "hover:shadow-md",
          large ? "grid grid-cols-[140px_1fr_96px] gap-4" : "grid grid-cols-[96px_1fr_86px] gap-3"
        )}
      >
        <div className={`relative overflow-hidden rounded-xl ${large ? "h-[140px]" : "h-24"}`}>
          {listing.photoUrl ? (
            <Image src={listing.photoUrl} alt={listing.title} fill className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#F1E5D8] to-[#ECD8C7] text-2xl">
              {listing.serviceIcon}
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="truncate text-[12px] text-[#6C5B4F]">
            {listing.serviceIcon} {listing.serviceLabel} · {listing.distanceMiles.toFixed(1)} mi away
          </p>
          <p className="truncate font-serif text-[15px]">{listing.title}</p>
          <p className="truncate text-[12px] text-[#7C6B5E]">
            {hasPublishedRating(listing.reviewCount, listing.rating)
              ? `★ ${listing.rating.toFixed(1)} (${listing.reviewCount})`
              : "New"}{" "}
            ·{" "}
            <Users className="mx-0.5 inline size-3.5 text-current" aria-hidden="true" />
            up to {listing.capacity} ·{" "}
            {listing.instantBook ? "⚡ Instant book" : "Request to book"}
          </p>
          <div className="flex flex-wrap gap-1">
            {listing.amenities.slice(0, 2).map((amenity) => (
              <span key={amenity} className="rounded-full bg-[#F3E8DE] px-2 py-0.5 text-[10px] text-[#6C5B4F]">
                {amenity}
              </span>
            ))}
            {listing.amenities.length > 2 ? (
              <span className="rounded-full bg-[#F3E8DE] px-2 py-0.5 text-[10px] text-[#6C5B4F]">
                +{listing.amenities.length - 2} more
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex min-w-[80px] flex-col items-end justify-between text-right">
          <div>
            <p className="text-[11px] text-[#8A7769]">from</p>
            <p className="text-[20px] font-bold text-[#C75B3A]">${Math.round(listing.priceSolo)}</p>
            <p className="text-[11px] text-[#8A7769]">
              {listing.sessionType === "fixed_session" ? "/session" : "/pp/hr"}
            </p>
          </div>
          <p className="text-[11px] text-[#6C5B4F]">
            <span
              className={`mr-1 inline-block size-2 rounded-full ${
                listing.availableToday ? "bg-emerald-500" : "bg-zinc-400"
              }`}
            />
            {listing.availableToday ? "Available today" : listing.nextAvailableLabel}
          </p>
        </div>
      </div>
    )
  }

  const mapOnlyTranslate = sheetExpanded ? 0 : "calc(50vh - 200px)"
  const mapOnlySheetStyle = {
    transform: `translateY(calc(${mapOnlyTranslate} + ${sheetDrag}px))`,
  }
  return (
    <div className={viewMode === "list" ? "min-h-[calc(100svh-88px)] bg-[#F7F3EE]" : "h-[calc(100svh-88px)] overflow-hidden bg-[#F7F3EE]"}>
      <div className="sticky top-0 z-30 border-b border-[#F0E8E0] bg-[#FAF7F4]">
          <div className="relative z-30 px-4 py-3 md:px-6">
          <div className="flex items-center gap-2 md:justify-between md:gap-3">
            <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto snap-x-pills md:overflow-visible">
              <div className="flex w-max items-center gap-2 whitespace-nowrap pl-1 md:w-full md:flex-wrap md:gap-2.5 md:whitespace-normal md:pl-0">
            <Popover
              open={openFilter === "service"}
              onOpenChange={(open) => {
                if (open) {
                  setServiceDraft(filters.serviceTypes)
                  setOpenFilter("service")
                } else if (openFilter === "service") {
                  setOpenFilter(null)
                }
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    filters.serviceTypes.length
                      ? "border-[#1A1410] bg-[#1A1410] text-white"
                      : "border-[#D9CEC1] bg-white text-[#1A1410] hover:border-[#C9B9A7]"
                  }`}
                >
                  {serviceChipLabel()}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="z-30 w-72 border-[#E8DED3] p-3">
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {serviceTypeOptions.map((serviceType) => {
                    const active = serviceDraft.includes(serviceType.id)
                    return (
                      <motion.button
                        key={serviceType.id}
                        type="button"
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        onClick={() => toggleServiceTypeDraft(serviceType.id)}
                        className={`flex w-full items-center justify-between rounded-lg border px-2 py-2 text-left text-xs ${
                          active ? "border-[#C75B3A] bg-[#FFF5F0] text-[#C75B3A]" : "border-transparent hover:bg-[#FAF6F1]"
                        }`}
                      >
                        <span>
                          {serviceType.icon} {serviceType.display_name}
                        </span>
                        <span>{active ? "✓" : ""}</span>
                      </motion.button>
                    )
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    className="text-xs text-[#C75B3A]"
                    onClick={() => setServiceDraft([])}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-[#C75B3A] px-3 py-1 text-xs text-white"
                    onClick={() => {
                      updateFilter("serviceTypes", serviceDraft)
                      setOpenFilter(null)
                    }}
                  >
                    Apply
                  </button>
                </div>
              </PopoverContent>
            </Popover>

            <Popover
              open={openFilter === "price"}
              onOpenChange={(open) => {
                if (open) setOpenFilter("price")
                else if (openFilter === "price") setOpenFilter(null)
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    filters.priceMin > DEFAULT_FILTERS.priceMin || filters.priceMax < DEFAULT_FILTERS.priceMax
                      ? "border-[#1A1410] bg-[#1A1410] text-white"
                      : "border-[#D9CEC1] bg-white text-[#1A1410] hover:border-[#C9B9A7]"
                  }`}
                >
                  {priceLabel()}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="z-30 w-72 rounded-lg border-[#E1D5C7] p-3 shadow-none"
              >
                <div className="relative h-8">
                  <div className="absolute top-1/2 right-0 left-0 h-1.5 -translate-y-1/2 rounded-full bg-[#E6DDD3]" />
                  <div
                    className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#C75B3A]"
                    style={{ left: `${priceMinPct}%`, right: `${100 - priceMaxPct}%` }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={PRICE_MAX_ANY}
                    value={filters.priceMin}
                    onChange={(event) =>
                      updateFilter(
                        "priceMin",
                        Math.min(Number(event.target.value), filters.priceMax - 5)
                      )
                    }
                    className="pointer-events-auto absolute inset-0 w-full appearance-none bg-transparent accent-[#C75B3A]"
                  />
                  <input
                    type="range"
                    min={0}
                    max={PRICE_MAX_ANY}
                    value={filters.priceMax}
                    onChange={(event) =>
                      updateFilter(
                        "priceMax",
                        Math.max(Number(event.target.value), filters.priceMin + 5)
                      )
                    }
                    className="pointer-events-auto absolute inset-0 w-full appearance-none bg-transparent accent-[#C75B3A]"
                  />
                </div>
                <p className="text-sm">{priceValueLabel()}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-[#E1D5C7] px-2 py-1 text-xs hover:bg-[#F8F2EA]"
                    onClick={() => {
                      updateFilter("priceMin", 0)
                      updateFilter("priceMax", 25)
                    }}
                  >
                    Under $25
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-[#E1D5C7] px-2 py-1 text-xs hover:bg-[#F8F2EA]"
                    onClick={() => {
                      updateFilter("priceMin", 0)
                      updateFilter("priceMax", 50)
                    }}
                  >
                    Under $50
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-[#E1D5C7] px-2 py-1 text-xs hover:bg-[#F8F2EA]"
                    onClick={() => {
                      updateFilter("priceMin", 0)
                      updateFilter("priceMax", 100)
                    }}
                  >
                    Under $100
                  </button>
                </div>
              </PopoverContent>
            </Popover>

            <Popover
              open={openFilter === "distance"}
              onOpenChange={(open) => {
                if (open) setOpenFilter("distance")
                else if (openFilter === "distance") setOpenFilter(null)
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    filters.distanceMiles !== DEFAULT_FILTERS.distanceMiles
                      ? "border-[#1A1410] bg-[#1A1410] text-white"
                      : "border-[#D9CEC1] bg-white text-[#1A1410] hover:border-[#C9B9A7]"
                  }`}
                >
                  {distanceLabel()}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="z-30 w-48 border-[#E8DED3] p-3">
                {[1, 2, 5, 10, 25, 50, DISTANCE_ANY].map((value) => (
                  <label key={value} className="mb-1 flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-[#FAF6F1]">
                    <input
                      type="radio"
                      checked={filters.distanceMiles === value}
                      onChange={() => updateFilter("distanceMiles", value)}
                    />
                    {value === DISTANCE_ANY ? "Any" : `${value} mi`}
                  </label>
                ))}
              </PopoverContent>
            </Popover>

            {[
              { active: filters.availableToday, key: "availableToday" as const, label: "Available Today" },
              { active: filters.instantBook, key: "instantBook" as const, label: "Instant Book" },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => updateFilter(chip.key, !chip.active)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                  chip.active ? "border-[#1A1410] bg-[#1A1410] text-white" : "bg-white"
                }`}
              >
                {chip.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => updateFilter("minRating", filters.minRating ? null : 4.5)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                filters.minRating ? "border-[#1A1410] bg-[#1A1410] text-white" : "bg-white"
              }`}
            >
              ★ 4.5+
            </button>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS)
                  setServiceDraft([])
                }}
                className="shrink-0 text-[13px] text-[#C75B3A]"
              >
                × Clear filters ({activeFilterCount})
              </button>
            ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === "map" ? "list" : "map")}
              className="shrink-0 whitespace-nowrap rounded-lg border border-[#E5DDD6] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[#2C2420] md:hidden"
            >
              <span className="inline-flex items-center gap-1">
                {viewMode === "map" ? (
                  <>
                    <List className="size-3.5" />
                    List
                  </>
                ) : (
                  <>
                    <MapIcon className="size-3.5" />
                    Map
                  </>
                )}
              </span>
            </button>
            <div className="hidden items-center gap-3 md:flex md:shrink-0 md:pl-3">
              <div className="text-right">
                <p className="text-sm text-[#6C5B4F]">{resultCountLabel}</p>
                {showingNearbyFallback ? (
                  <p className="text-xs text-[#8A7769]">
                    Showing nearby options up to {NEARBY_FALLBACK_MILES} mi in split/map view.
                  </p>
                ) : null}
              </div>
              <Select value={filters.sort} onValueChange={(value) => updateFilter("sort", value as SortKey)}>
                <SelectTrigger className="h-9 min-w-[190px] rounded-full border bg-white px-3 text-sm shadow-none focus-visible:ring-1">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="recommended">Recommended</SelectItem>
                  <SelectItem value="nearest">Nearest first</SelectItem>
                  <SelectItem value="price_low">Price: low to high</SelectItem>
                  <SelectItem value="price_high">Price: high to low</SelectItem>
                  <SelectItem value="rating">Highest rated</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex rounded-full border bg-white p-1">
                {(isMobile
                  ? [
                      { key: "list", icon: List, label: "List" },
                      { key: "map", icon: MapIcon, label: "Map" },
                    ]
                  : [
                      { key: "list", icon: List, label: "List" },
                      { key: "split", icon: Layers, label: "Split" },
                      { key: "map", icon: MapIcon, label: "Map" },
                    ]
                ).map((item) => {
                  const Icon = item.icon
                  const active = viewMode === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setViewMode(item.key as ViewMode)}
                      className={`rounded-full px-3 py-1.5 text-xs ${
                        active ? "bg-[#1A1410] text-white" : "text-[#6C5B4F]"
                      }`}
                    >
                      <Icon className="mr-1 inline size-3.5" />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mx-auto mt-6 max-w-xl rounded-2xl bg-white p-8 text-center shadow">
          <p className="font-serif text-2xl">Couldn&apos;t load spaces. Try adjusting your filters.</p>
          <button
            type="button"
            className="mt-4 rounded-full bg-[#C75B3A] px-4 py-2 text-sm text-white"
            onClick={() => {
              setFilters(DEFAULT_FILTERS)
              setServiceDraft([])
            }}
          >
            Clear filters
          </button>
        </div>
      ) : null}

      {!error ? (
        <>
          {viewMode === "split" ? (
            <div className="grid h-[calc(100%-58px)] grid-cols-1 md:grid-cols-[45%_55%]">
              <div className="overflow-y-auto bg-[#F7F3EE] p-4">
                <div className="space-y-3">
                  {loading
                    ? new Array(8).fill(null).map((_, i) => (
                        <div key={i} className="h-[112px] animate-pulse rounded-2xl bg-white/70" />
                      ))
                    : modeListings.length
                      ? modeListings.map((listing) => listCard(listing))
                      : (
                        <div className="rounded-2xl bg-white p-8 text-center">
                          <p className="font-serif text-2xl">No spaces found in this area</p>
                          <button
                            type="button"
                            className="mt-3 rounded-full bg-[#C75B3A] px-4 py-2 text-sm text-white"
                            onClick={() => updateFilter("distanceMiles", 50)}
                          >
                            Expand search radius
                          </button>
                        </div>
                      )}
                </div>
              </div>
              <div className="relative">{mapPanel}</div>
            </div>
          ) : null}

          {viewMode === "list" ? (
            <div className="px-4 py-4 md:px-6">
              <div className="mb-3 flex items-center justify-between md:hidden">
                <div>
                  <p className="text-sm text-[#6C5B4F]">{resultCountLabel}</p>
                  {showingNearbyFallback ? (
                    <p className="text-xs text-[#8A7769]">Showing nearby options in map/split views.</p>
                  ) : null}
                </div>
                <Select value={filters.sort} onValueChange={(value) => updateFilter("sort", value as SortKey)}>
                  <SelectTrigger className="h-8 min-w-[170px] rounded-full border bg-white px-3 text-sm shadow-none focus-visible:ring-1">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="recommended">Recommended</SelectItem>
                    <SelectItem value="nearest">Nearest first</SelectItem>
                    <SelectItem value="price_low">Price: low to high</SelectItem>
                    <SelectItem value="price_high">Price: high to low</SelectItem>
                    <SelectItem value="rating">Highest rated</SelectItem>
                    <SelectItem value="newest">Newest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 xl:grid-cols-3 md:grid-cols-2">
                {loading
                  ? new Array(9).fill(null).map((_, i) => (
                      <div key={i} className="h-[170px] animate-pulse rounded-2xl bg-white/70" />
                    ))
                  : listings.map((listing) => listCard(listing, true))}
              </div>
              {!isMobile ? (
                <button
                  type="button"
                  className="fixed right-5 bottom-6 z-30 rounded-full bg-[#C75B3A] px-4 py-2 text-sm text-white shadow md:bottom-8"
                  onClick={() => setViewMode("split")}
                >
                  ⊞ Show map
                </button>
              ) : null}
            </div>
          ) : null}

          {viewMode === "map" ? (
            <div className="relative h-[calc(100%-58px)]">
              {mapPanel}
              {isMobile ? (
                <>
                  <div
                    ref={mobileMapCardsRef}
                    className="no-scrollbar pointer-events-auto fixed right-0 bottom-0 left-0 z-40 flex snap-x snap-mandatory gap-3 overflow-x-auto bg-transparent p-4"
                    onScroll={(event) => {
                      const element = event.currentTarget
                      const cardWidth = 292
                      const index = Math.round(element.scrollLeft / cardWidth)
                      const listing = modeListings[index]
                      if (!listing) return
                      setActiveId(listing.id)
                      setActiveSource("pin")
                    }}
                  >
                    {modeListings.map((listing) => (
                      <button
                        key={listing.id}
                        type="button"
                        onPointerDown={(event) =>
                          beginMapCardTap(event.pointerId, event.clientX, event.clientY)
                        }
                        onPointerMove={(event) =>
                          trackMapCardTap(event.pointerId, event.clientX, event.clientY)
                        }
                        onPointerCancel={(event) => clearMapCardTap(event.pointerId)}
                        onPointerUp={(event) => releaseMapCardTap(event.pointerId)}
                        onClick={() => {
                          if (mapCardTapRef.current.suppressClick) {
                            clearMapCardTap()
                            return
                          }
                          clearMapCardTap()
                          openListingFromCard(listing.id)
                        }}
                        className="w-[280px] shrink-0 snap-start overflow-hidden rounded-2xl bg-white p-3 text-left shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
                      >
                        <div className="flex gap-3">
                          <div className="relative h-20 w-24 overflow-hidden rounded-xl">
                            {listing.photoUrl ? (
                              <Image src={listing.photoUrl} alt={listing.title} fill className="object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center bg-[#F3E8DE] text-2xl">
                                {listing.serviceIcon}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm font-semibold text-[#1A1410]">{listing.title}</p>
                            <p className="mt-1 text-xs text-[#6C5B4F]">
                              {hasPublishedRating(listing.reviewCount, listing.rating)
                                ? `★ ${listing.rating.toFixed(1)} (${listing.reviewCount})`
                                : "New"}{" "}
                              · {listing.distanceMiles.toFixed(1)} mi
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[#C75B3A]">
                              ${Math.round(listing.priceSolo)}{listing.sessionType === "fixed_session" ? "/session" : "/pp/hr"}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div
                  className="absolute right-0 bottom-0 left-0 z-30 h-[50vh] rounded-t-2xl bg-white shadow-[0_-10px_30px_rgba(0,0,0,0.12)] transition-transform"
                  style={mapOnlySheetStyle}
                  onPointerDown={(event) => setDragStartY(event.clientY)}
                  onPointerMove={(event) => {
                    if (dragStartY === null) return
                    setSheetDrag(event.clientY - dragStartY)
                  }}
                  onPointerUp={() => {
                    if (sheetDrag < -50) setSheetExpanded(true)
                    if (sheetDrag > 50) setSheetExpanded(false)
                    setSheetDrag(0)
                    setDragStartY(null)
                  }}
                >
                  <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-zinc-300" />
                  <div className="p-3">
                    {sheetExpanded ? (
                      <div className="h-[calc(50vh-44px)] space-y-2 overflow-y-auto">
                        {modeListings.map((listing) => listCard(listing))}
                      </div>
                    ) : (
                      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
                        {modeListings.map((listing) => (
                          <button
                            key={listing.id}
                            type="button"
                            onPointerDown={(event) =>
                              beginMapCardTap(event.pointerId, event.clientX, event.clientY)
                            }
                            onPointerMove={(event) =>
                              trackMapCardTap(event.pointerId, event.clientX, event.clientY)
                            }
                            onPointerCancel={(event) => clearMapCardTap(event.pointerId)}
                            onPointerUp={(event) => releaseMapCardTap(event.pointerId)}
                            onClick={() => {
                              if (mapCardTapRef.current.suppressClick) {
                                clearMapCardTap()
                                return
                              }
                              clearMapCardTap()
                              openListingFromCard(listing.id)
                            }}
                            className="w-40 shrink-0 overflow-hidden rounded-xl border bg-white text-left"
                          >
                            <div className="relative h-20">
                              {listing.photoUrl ? (
                                <Image src={listing.photoUrl} alt={listing.title} fill className="object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center bg-[#F3E8DE] text-2xl">
                                  {listing.serviceIcon}
                                </div>
                              )}
                            </div>
                            <div className="p-2">
                              <p className="line-clamp-1 text-xs">{listing.title}</p>
                              <p className="text-sm font-semibold text-[#C75B3A]">
                                ${Math.round(listing.priceSolo)}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}

        </>
      ) : null}
    </div>
  )
}
