import { cache } from "react"

import type { ServiceType } from "@/lib/constants/service-types"
import { getServiceType } from "@/lib/constants/service-types"
import type { ListingCardData } from "@/components/listings/ListingCard"
import { getFallbackServiceType } from "@/lib/service-types"
import { createPublicReadSupabase } from "@/lib/supabase/public-read"

export type LocalLandingFaqItem = {
  question: string
  answer: string
}

export type LocalSeoCopy = {
  title: string
  description: string
  h1: string
  subtitle: string
  ctaLabel: string
  ctaHref: string
  introHtml: string
  secondaryKeywordsLine: string
  emptyStateTitle: string
  emptyStateBody: string
  faq: LocalLandingFaqItem[]
}

/** URL segment → canonical slug (SEO prefers stable URLs). */
export const SERVICE_CANONICAL_SLUG: Record<ServiceType, string> = {
  sauna: "saunas",
  cold_plunge: "cold-plunge",
  hot_tub: "hot-tub",
  infrared: "infrared",
  float_tank: "float-tank",
  pemf: "pemf",
  halotherapy: "halotherapy",
  hyperbaric: "hyperbaric",
}

const EXTRA_SERVICE_SLUGS: Partial<Record<string, ServiceType>> = {
  sauna: "sauna",
  cold_plunge: "cold_plunge",
  float_tank: "float_tank",
  hot_tub: "hot_tub",
}

function buildSlugToServiceType(): Map<string, ServiceType> {
  const map = new Map<string, ServiceType>()
  for (const [type, slug] of Object.entries(SERVICE_CANONICAL_SLUG) as [ServiceType, string][]) {
    map.set(slug, type)
    map.set(type, type)
  }
  for (const [slug, type] of Object.entries(EXTRA_SERVICE_SLUGS)) {
    if (type) map.set(slug, type)
  }
  return map
}

const SLUG_TO_SERVICE = buildSlugToServiceType()

export function resolveServiceFromSlug(
  segment: string
): { serviceType: ServiceType; canonicalSlug: string; needsRedirect: boolean } | null {
  const normalized = segment.trim().toLowerCase()
  if (!normalized) return null
  const serviceType = SLUG_TO_SERVICE.get(normalized)
  if (!serviceType) return null
  const canonicalSlug = SERVICE_CANONICAL_SLUG[serviceType]
  return {
    serviceType,
    canonicalSlug,
    needsRedirect: normalized !== canonicalSlug,
  }
}

/** "seattle" → "Seattle", "san-francisco" → "San Francisco" */
export function citySlugToDisplayName(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

function defaultCopy(serviceType: ServiceType, city: string, serviceLabel: string): LocalSeoCopy {
  const exploreHref = `/explore?location=${encodeURIComponent(`${city}, WA`)}&lat=47.60620&lng=-122.33210&distance=50`
  return {
    title: `Private ${serviceLabel} in ${city} | Book Hourly on thrml`,
    description: `Discover and book private ${serviceLabel.toLowerCase()} spaces in ${city}. Hourly or session-based rentals, flexible cancellation, and wellness experiences hosted by locals on thrml.`,
    h1: `Book a private ${serviceLabel.toLowerCase()} in ${city}`,
    subtitle: `Compare spaces, check real photos, and reserve a session in minutes — no memberships or front desks.`,
    ctaLabel: "Browse all spaces",
    ctaHref: exploreHref,
    introHtml: `<p>thrml connects you with private wellness hosts in <strong>${city}</strong>. Whether you are planning recovery, contrast therapy, or a focused self-care block, book a <strong>${serviceLabel.toLowerCase()}</strong> on your schedule.</p>`,
    secondaryKeywordsLine: `Find contrast therapy and biohacking-friendly rentals, solo sessions, and small-group bookings in ${city}.`,
    emptyStateTitle: `Be the first to host a ${serviceLabel.toLowerCase()} in ${city}`,
    emptyStateBody: `List your space on thrml to reach guests searching for private wellness bookings in ${city}.`,
    faq: [
      {
        question: `How do I book a private ${serviceLabel.toLowerCase()} in ${city}?`,
        answer: `Choose a listing on thrml, pick a time, and complete checkout. You will receive booking details from your host.`,
      },
      {
        question: `Can I rent by the hour?`,
        answer: `Many listings offer hourly pricing; others use fixed session lengths. Each listing shows the pricing model clearly before you book.`,
      },
      {
        question: `What is your cancellation policy?`,
        answer: `Cancellation rules are set per listing. Review the policy on the listing page before you confirm your booking.`,
      },
    ],
  }
}

const SEATTLE_COPY: Partial<Record<ServiceType, Omit<LocalSeoCopy, "title" | "description" | "h1"> & {
  title: string
  description: string
  h1: string
}>> = {
  sauna: {
    title: "Private Sauna Rentals in Seattle | Book Hourly on thrml",
    description:
      "Discover and book private saunas in Seattle. Hourly rentals, flexible cancellation, and top-rated wellness spaces hosted by locals — book a private sauna in minutes.",
    h1: "Book a private sauna in Seattle",
    subtitle:
      "Private sauna rental Seattle guests love: real photos, transparent pricing, and simple booking for hourly sauna sessions.",
    ctaLabel: "See available saunas",
    ctaHref:
      "/explore?location=Seattle%2C%20WA&lat=47.60620&lng=-122.33210&distance=50&service=sauna",
    introHtml: `<p>Looking for <strong>private sauna rental Seattle</strong> options or ready to <strong>book a private sauna</strong> for recovery and relaxation? Browse thrml hosts offering traditional and wood-fired experiences across the metro.</p>`,
    secondaryKeywordsLine:
      "Also explore contrast therapy session booking, recovery-focused sauna blocks, and biohacking-friendly wellness space rental in Seattle.",
    emptyStateTitle: "Be the first to host a private sauna in Seattle",
    emptyStateBody:
      "Seattle guests are searching for private sauna rentals. Publish your space on thrml to capture high-intent hourly bookings.",
    faq: [
      {
        question: "Where can I book a private sauna in Seattle?",
        answer:
          "thrml lists private sauna spaces hosted by individuals across Seattle and nearby neighborhoods. Use filters on each listing to confirm session length and amenities.",
      },
      {
        question: "Is private sauna rental in Seattle hourly?",
        answer:
          "Most sauna listings on thrml use hourly pricing per guest tier. Fixed-length sessions appear where hosts prefer that model — check the listing card before checkout.",
      },
      {
        question: "What should I bring to a private sauna session?",
        answer:
          "Hosts outline house rules and what is included. Typical items are towels, water, and sandals; your confirmation will link to full details.",
      },
    ],
  },
  cold_plunge: {
    title: "Private Cold Plunge in Seattle | Book a Session on thrml",
    description:
      "Cold plunge booking near Seattle: book a private cold plunge session with local hosts. Compare tanks and recovery setups, see pricing, and reserve in a few clicks.",
    h1: "Book a private cold plunge in Seattle",
    subtitle:
      "Find private cold plunge session options across Seattle — ideal for contrast therapy stacks after sauna or training days.",
    ctaLabel: "See cold plunges near Seattle",
    ctaHref:
      "/explore?location=Seattle%2C%20WA&lat=47.60620&lng=-122.33210&distance=50&service=cold_plunge",
    introHtml: `<p>If you are searching for <strong>cold plunge booking near me</strong> in Seattle, thrml surfaces private setups you can reserve without a spa membership. Book a focused <strong>private cold plunge session</strong> when you want recovery, not a crowd.</p>`,
    secondaryKeywordsLine:
      "Stack sauna and cold plunge bookings, plan contrast therapy sessions, and discover biohacking-friendly recovery spaces in Seattle.",
    emptyStateTitle: "Be the first to list a cold plunge in Seattle",
    emptyStateBody:
      "Guests want cold plunge booking options in Seattle. List your tank or recovery studio on thrml to get discovered organically.",
    faq: [
      {
        question: "How does cold plunge booking work on thrml?",
        answer:
          "Pick a listing, choose an available time, and pay securely. Your host confirms access details and any preparation steps.",
      },
      {
        question: "Can I book a private cold plunge session after a sauna?",
        answer:
          "Many guests combine experiences. Filter listings or message hosts to plan contrast therapy-style sessions that fit your routine.",
      },
      {
        question: "Are cold plunges safe for beginners?",
        answer:
          "Cold exposure carries real risks. Review host guidelines and consult a clinician if you are unsure; never push past your comfort zone.",
      },
    ],
  },
  float_tank: {
    title: "Float Tank Rental in Seattle | Book Private Sessions | thrml",
    description:
      "Float tank rental near Seattle: book private float sessions with independent hosts. Compare tanks, pricing, and availability on thrml.",
    h1: "Book a private float tank in Seattle",
    subtitle:
      "Float tank rental near me, without the big-spa waitlist — private sensory deprivation sessions from local hosts.",
    ctaLabel: "Browse float tanks",
    ctaHref:
      "/explore?location=Seattle%2C%20WA&lat=47.60620&lng=-122.33210&distance=50&service=float_tank",
    introHtml: `<p>Searching for <strong>float tank rental near me</strong> in Seattle? thrml highlights private float rooms and tanks you can book directly — perfect for deep rest, creativity blocks, or nervous system recovery.</p>`,
    secondaryKeywordsLine:
      "Discover sensory deprivation float sessions, calm-focused wellness rentals, and low-friction booking for solo float time in Seattle.",
    emptyStateTitle: "Be the first to host float tank sessions in Seattle",
    emptyStateBody:
      "List your float tank or float room on thrml to reach guests looking for private float tank rental in Seattle.",
    faq: [
      {
        question: "What is included in a float tank rental?",
        answer:
          "Each host describes session length, amenities, and what to expect before your float. Details are on the listing page and in your confirmation.",
      },
      {
        question: "How long is a typical float session?",
        answer:
          "Session length varies by host. thrml listings show whether pricing is per session or timed blocks so you can compare options.",
      },
      {
        question: "Can first-time floaters book on thrml?",
        answer:
          "Yes — choose a listing that matches your comfort level and read the host’s preparation notes before you arrive.",
      },
    ],
  },
}

export function getLocalSeoCopy(serviceType: ServiceType, citySlug: string): LocalSeoCopy {
  const city = citySlugToDisplayName(citySlug)
  const meta = getServiceType(serviceType)
  const serviceLabel = meta?.label ?? serviceType.replace(/_/g, " ")

  const isSeattle = citySlug.trim().toLowerCase() === "seattle"
  const tailored = isSeattle ? SEATTLE_COPY[serviceType] : undefined
  if (tailored) {
    return { ...tailored }
  }

  return defaultCopy(serviceType, city, serviceLabel)
}

export type LocalListingRow = {
  id: string
  title: string | null
  service_type: string | null
  session_type: string | null
  location: string | null
  location_address: string | null
  location_city: string | null
  location_state: string | null
  city: string | null
  state: string | null
  country: string | null
  lat: number | string | null
  lng: number | string | null
  price_solo: number | string | null
  fixed_session_price: number | string | null
  listing_photos: { url: string | null; order_index: number | null }[] | null
  listing_ratings: { avg_overall: number | null; review_count: number | null }[] | null
}

/** Center + radius for local landing when hosts rely on map pins more than normalized city fields. */
const LOCAL_LANDING_GEO_BY_SLUG: Record<string, { lat: number; lng: number; radiusMiles: number }> = {
  seattle: { lat: 47.6062, lng: -122.3321, radiusMiles: 65 },
}

/**
 * Puget Sound cities matched for `/saunas/seattle` (etc.) so suburbs don’t disappear
 * when `city`/`location_city` don’t contain the word "Seattle".
 */
const SEATTLE_METRO_TEXT_CITIES = [
  "Bellevue",
  "Bothell",
  "Burien",
  "Edmonds",
  "Everett",
  "Federal Way",
  "Issaquah",
  "Kent",
  "Kirkland",
  "Lynnwood",
  "Mercer Island",
  "Olympia",
  "Redmond",
  "Renton",
  "Sammamish",
  "SeaTac",
  "Shoreline",
  "Tacoma",
  "Tukwila",
  "Woodinville",
] as const

const LOCAL_LANDING_LIMIT = 250

const LOCAL_LANDING_SELECT =
  "id, title, service_type, session_type, location, location_address, location_city, location_state, city, state, country, lat, lng, price_solo, fixed_session_price, is_featured, created_at, listing_photos(url, order_index), listing_ratings(avg_overall, review_count)"

/** Same row shape but without rating embed (older DBs / schema drift). */
const LOCAL_LANDING_SELECT_MINIMAL =
  "id, title, service_type, session_type, location, location_address, location_city, location_state, city, state, country, lat, lng, price_solo, fixed_session_price, is_featured, created_at, listing_photos(url, order_index)"

type LocalListingQueryRow = LocalListingRow & {
  is_featured?: boolean | null
  created_at?: string | null
}

/** PostgREST ilike: * is wildcard (avoids % encoding in filters). */
function buildCityTextOrFilter(cityDisplayName: string): string {
  const safeCity = cityDisplayName.replace(/"/g, "")
  const ilikeCore = `*${safeCity}*`
  const ilikePattern = /[^a-zA-Z0-9]/.test(safeCity) ? `"${ilikeCore}"` : ilikeCore
  return [
    `city.ilike.${ilikePattern}`,
    `location_city.ilike.${ilikePattern}`,
    `location.ilike.${ilikePattern}`,
    `location_address.ilike.${ilikePattern}`,
  ].join(",")
}

function mergeLocalLandingRows(rows: LocalListingQueryRow[]): LocalListingRow[] {
  const seen = new Set<string>()
  const out: LocalListingQueryRow[] = []
  for (const row of rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  out.sort((a, b) => {
    const fa = a.is_featured ? 1 : 0
    const fb = b.is_featured ? 1 : 0
    if (fb !== fa) return fb - fa
    const ta = new Date(a.created_at ?? 0).getTime()
    const tb = new Date(b.created_at ?? 0).getTime()
    return tb - ta
  })
  return out
}

/** DB `service_type` values shown on this SEO URL (sauna landings include infrared saunas). */
function serviceTypesForLocalLanding(serviceType: ServiceType): string[] {
  if (serviceType === "sauna") return ["sauna", "infrared"]
  return [serviceType]
}

export function mapRowToListingCard(row: LocalListingRow): ListingCardData {
  const city =
    typeof row.city === "string"
      ? row.city
      : typeof row.location_city === "string"
        ? row.location_city
        : ""
  const state =
    typeof row.state === "string"
      ? row.state
      : typeof row.location_state === "string"
        ? row.location_state
        : ""
  const country = typeof row.country === "string" ? row.country : ""
  const parts = [city, state, country].filter((p) => p.length > 0)
  const derivedLocation = parts.join(", ")
  const fallbackLocation =
    typeof row.location === "string" ? row.location : "Location available after booking"

  const serviceTypeId = typeof row.service_type === "string" ? row.service_type : null
  const st = serviceTypeId ? getFallbackServiceType(serviceTypeId) : undefined

  const sortedPhotos = [...(row.listing_photos ?? [])].sort(
    (a, b) => (a.order_index ?? 999) - (b.order_index ?? 999)
  )
  const ratingRow = row.listing_ratings?.[0]
  const reviewCount = Number(ratingRow?.review_count ?? 0)
  const rating = typeof ratingRow?.avg_overall === "number" ? ratingRow.avg_overall : null

  const sessionType = row.session_type === "fixed_session" ? "fixed_session" : "hourly"
  const priceSolo =
    sessionType === "fixed_session"
      ? Number(row.fixed_session_price ?? row.price_solo ?? 0)
      : Number(row.price_solo ?? 0)

  return {
    id: row.id,
    title: typeof row.title === "string" && row.title.trim() ? row.title : "Wellness space",
    location: derivedLocation || fallbackLocation,
    city: city || null,
    state: state || null,
    serviceTypeId,
    serviceTypeName: st?.display_name ?? null,
    serviceTypeIcon: st?.icon ?? null,
    bookingModel: sessionType,
    photoUrl: sortedPhotos[0]?.url ?? null,
    priceSolo,
    rating,
    reviewCount,
  }
}

/**
 * Active listings for a local SEO page: service type match plus city text match
 * (`city`, `location_city`, `location`, `location_address`) and/or a known metro bbox
 * (see `LOCAL_LANDING_GEO_BY_SLUG`) when the URL slug has configured coordinates.
 */
async function fetchListingsForLocalLandingImpl(
  serviceType: ServiceType,
  cityDisplayName: string,
  citySlug?: string
): Promise<LocalListingRow[]> {
  const dev = process.env.NODE_ENV === "development"
  if (dev) console.time("[local landing] total")

  try {
    if (dev) console.time("[local landing] public supabase client")
    const supabase = createPublicReadSupabase()
    if (dev) console.timeEnd("[local landing] public supabase client")

    const slugKey = citySlug?.trim().toLowerCase() ?? ""
    /** One PostgREST `.or()` (comma = OR) — avoids N round-trips for Seattle metro. */
    const metroCities =
      slugKey === "seattle" ? [cityDisplayName, ...SEATTLE_METRO_TEXT_CITIES] : [cityDisplayName]
    const textOrFilter = metroCities.map(buildCityTextOrFilter).join(",")
    const typeFilter = serviceTypesForLocalLanding(serviceType)

    const base = (select: string) =>
      supabase
        .from("listings")
        .select(select)
        .eq("is_active", true)
        .eq("is_deleted", false)
        .limit(LOCAL_LANDING_LIMIT)

    async function runTextQueryWithOr(
      select: typeof LOCAL_LANDING_SELECT | typeof LOCAL_LANDING_SELECT_MINIMAL,
      orClause: string
    ): Promise<LocalListingQueryRow[]> {
      if (dev) console.time("[local landing] text query")
      const { data, error } = await base(select)
        .in("service_type", typeFilter)
        .or(orClause)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false })
      if (dev) console.timeEnd("[local landing] text query")
      if (error) {
        if (select === LOCAL_LANDING_SELECT) {
          console.warn("[local landing] text query failed, retry without ratings embed", error.message)
          return runTextQueryWithOr(LOCAL_LANDING_SELECT_MINIMAL, orClause)
        }
        console.error("[local landing] text listings query failed", error.message)
        return []
      }
      return (data ?? []) as unknown as LocalListingQueryRow[]
    }

    async function runGeoQuery(
      select: typeof LOCAL_LANDING_SELECT | typeof LOCAL_LANDING_SELECT_MINIMAL,
      g: NonNullable<(typeof LOCAL_LANDING_GEO_BY_SLUG)[string]>
    ): Promise<LocalListingQueryRow[]> {
      const delta = g.radiusMiles / 69
      if (dev) console.time("[local landing] geo query")
      const { data, error } = await base(select)
        .in("service_type", typeFilter)
        .gte("lat", g.lat - delta)
        .lte("lat", g.lat + delta)
        .gte("lng", g.lng - delta)
        .lte("lng", g.lng + delta)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false })
      if (dev) console.timeEnd("[local landing] geo query")
      if (error) {
        if (select === LOCAL_LANDING_SELECT) {
          console.warn("[local landing] geo query failed, retry without ratings embed", error.message)
          return runGeoQuery(LOCAL_LANDING_SELECT_MINIMAL, g)
        }
        console.error("[local landing] geo listings query failed", error.message)
        return []
      }
      return (data ?? []) as unknown as LocalListingQueryRow[]
    }

    const geo =
      slugKey && LOCAL_LANDING_GEO_BY_SLUG[slugKey] ? LOCAL_LANDING_GEO_BY_SLUG[slugKey] : undefined

    if (dev) console.time("[local landing] parallel text+geo")
    const [textRows, geoRows] = await Promise.all([
      runTextQueryWithOr(LOCAL_LANDING_SELECT, textOrFilter),
      geo ? runGeoQuery(LOCAL_LANDING_SELECT, geo) : Promise.resolve([] as LocalListingQueryRow[]),
    ])
    if (dev) console.timeEnd("[local landing] parallel text+geo")

    return mergeLocalLandingRows([...textRows, ...geoRows])
  } finally {
    if (dev) console.timeEnd("[local landing] total")
  }
}

/** Dedupes identical calls in the same RSC request (e.g. generateMetadata + page). */
export const fetchListingsForLocalLanding = cache(fetchListingsForLocalLandingImpl)

export function getAppOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://usethrml.com").replace(/\/$/, "")
}
