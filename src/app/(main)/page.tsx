"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import Image from "next/image"
import { CheckCircle2, ChevronDown, Loader2, MapPin } from "lucide-react"
import { useRouter } from "next/navigation"

import { ListingGrid } from "@/components/listings/ListingGrid"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  FALLBACK_SERVICE_TYPES,
  isServiceTypeId,
  type ServiceTypeMeta,
} from "@/lib/service-types"
import { SERVICE_TYPES, type ServiceType } from "@/lib/constants/service-types"

type ListingApiRow = {
  id: string
  title: string | null
  location: string | null
  service_type?: string | null
  sauna_type?: string | null
  service_attributes?: Record<string, unknown> | null
  price_solo: number | null
  fixed_session_price: number | null
  session_type?: string | null
  listing_photos?: { url?: string | null }[]
  listing_ratings?: { avg_overall?: number | null; review_count?: number | null }[] | null
}

const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TRENDING_SERVICE_TYPES = ["sauna", "cold_plunge", "hot_tub"] as const satisfies readonly ServiceType[]
type TrendingServiceType = (typeof TRENDING_SERVICE_TYPES)[number]
const TRENDING_TAGLINES: Record<TrendingServiceType, string> = {
  sauna: "Traditional heat therapy · Relax & recover",
  cold_plunge: "Cold immersion · Boosts recovery",
  hot_tub: "Warm soak · Unwind & decompress",
}

function formatTrendingPrice(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2).replace(/\.00$/, "")
}

export default function Home() {
  const router = useRouter()
  const [location, setLocation] = useState("")
  const [heroServiceType, setHeroServiceType] = useState("all")
  const [geoLat, setGeoLat] = useState<number | null>(null)
  const [geoLng, setGeoLng] = useState<number | null>(null)
  const [newsletterEmail, setNewsletterEmail] = useState("")
  const [newsletterStatus, setNewsletterStatus] = useState<"idle" | "loading" | "success">("idle")
  const [newsletterError, setNewsletterError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>("all")
  const [listings, setListings] = useState<ListingApiRow[]>([])
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeMeta[]>(FALLBACK_SERVICE_TYPES)
  const [loading, setLoading] = useState(true)
  const [showScrollCue, setShowScrollCue] = useState(true)
  const newsletterInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    const loadListings = async () => {
      setLoading(true)
      try {
        const response = await fetch("/api/listings")
        const payload = (await response.json()) as { listings?: ListingApiRow[] }
        if (!cancelled) {
          setListings(payload.listings ?? [])
        }
      } catch {
        if (!cancelled) setListings([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadListings()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onScroll = () => {
      setShowScrollCue(window.scrollY < window.innerHeight * 0.25)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadServiceTypes = async () => {
      try {
        const response = await fetch("/api/service-types")
        const payload = (await response.json()) as { serviceTypes?: ServiceTypeMeta[] }
        if (!cancelled && payload.serviceTypes?.length) {
          setServiceTypes(payload.serviceTypes)
        }
      } catch {
        // Keep fallback service types.
      }
    }
    void loadServiceTypes()
    return () => {
      cancelled = true
    }
  }, [])

  const serviceTypeMap = useMemo(
    () => new Map(serviceTypes.map((serviceType) => [serviceType.id, serviceType])),
    [serviceTypes]
  )

  const filteredListings = useMemo(() => {
    return listings
      .filter((item) => {
        const listingServiceType = (item.service_type ?? "sauna").toLowerCase()
        const matchesFilter = filter === "all" || listingServiceType === filter
        const matchesLocation =
          !location ||
          (item.location ?? "").toLowerCase().includes(location.toLowerCase()) ||
          (item.title ?? "").toLowerCase().includes(location.toLowerCase())
        return matchesFilter && matchesLocation
      })
      .map((item) => {
        const serviceTypeId =
          typeof item.service_type === "string" && isServiceTypeId(item.service_type)
            ? item.service_type
            : "sauna"
        const serviceTypeMeta = serviceTypeMap.get(serviceTypeId)

        return {
          id: item.id,
          title: item.title ?? "Thrml Listing",
          location: item.location ?? "Location available after booking",
          serviceTypeName: serviceTypeMeta?.display_name ?? "Sauna",
          serviceTypeIcon: serviceTypeMeta?.icon ?? "🔥",
          bookingModel: serviceTypeMeta?.booking_model ?? "hourly",
          photoUrl: item.listing_photos?.[0]?.url ?? null,
          priceSolo: Number(item.price_solo ?? 0),
          rating: Number(item.listing_ratings?.[0]?.avg_overall ?? 0) || undefined,
          reviewCount: Number(item.listing_ratings?.[0]?.review_count ?? 0) || undefined,
        }
      })
  }, [filter, listings, location, serviceTypeMap])

  const trendingCategories = useMemo(() => {
    const serviceTypeMetaMap = new Map(SERVICE_TYPES.map((serviceType) => [serviceType.value, serviceType]))

    return TRENDING_SERVICE_TYPES.map((serviceType) => {
      let minPrice: number | null = null
      let minPriceUnit: "session" | "hr" | null = null

      for (const listing of listings) {
        if (listing.service_type !== serviceType) continue

        const isFixedSession = listing.session_type === "fixed_session"
        const rawPrice = isFixedSession ? listing.fixed_session_price : listing.price_solo
        const parsedPrice = Number(rawPrice)

        if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) continue
        if (minPrice === null || parsedPrice < minPrice) {
          minPrice = parsedPrice
          minPriceUnit = isFixedSession ? "session" : "hr"
        }
      }

      if (minPrice === null || minPriceUnit === null) return null

      const serviceTypeMeta = serviceTypeMetaMap.get(serviceType)
      if (!serviceTypeMeta) return null

      return {
        id: serviceType,
        emoji: serviceTypeMeta.emoji,
        label: serviceTypeMeta.label,
        tagline: TRENDING_TAGLINES[serviceType],
        priceText: `From $${formatTrendingPrice(minPrice)}/${minPriceUnit}`,
      }
    }).filter((category): category is NonNullable<typeof category> => category !== null)
  }, [listings])

  const skeletonCards = new Array(6).fill(null)
  const blurDataURL =
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL..."

  const heroImage = {
    url: "/hero-main-bg.png",
    objectPosition: "center center",
    alt: "Warm wooden sauna interior with stove",
  }

  function handleFindSpace() {
    const params = new URLSearchParams()
    const trimmedLocation = location.trim()

    if (!trimmedLocation) {
      params.set("location", "Seattle, WA")
      params.set("lat", "47.60620")
      params.set("lng", "-122.33210")
    } else {
      params.set("location", trimmedLocation)
      if (geoLat !== null && geoLng !== null) {
        params.set("lat", geoLat.toFixed(5))
        params.set("lng", geoLng.toFixed(5))
      }
    }
    if (heroServiceType !== "all") params.set("service", heroServiceType)
    params.set("distance", "50")
    params.set("view", "split")
    router.push(`/explore?${params.toString()}`)
  }

  function handleLocateMe() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoLat(position.coords.latitude)
        setGeoLng(position.coords.longitude)
        setLocation("Near me")
      },
      () => {
        setGeoLat(null)
        setGeoLng(null)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function handleNewsletterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newsletterStatus !== "idle") return

    const email = newsletterEmail.trim().toLowerCase()
    if (!VALID_EMAIL_REGEX.test(email)) {
      setNewsletterError("Please enter a valid email address.")
      newsletterInputRef.current?.focus()
      return
    }

    setNewsletterError(null)
    setNewsletterStatus("loading")

    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        throw new Error("Newsletter subscribe request failed")
      }

      setNewsletterStatus("success")
      setNewsletterEmail("")
    } catch {
      setNewsletterStatus("idle")
      setNewsletterError("Something went wrong. Please try again.")
    }
  }

  return (
    <div className="min-h-screen bg-warm-50">
      <section className="relative bg-[#1A1410] pt-24 pb-8 md:min-h-[100svh] md:pt-0 md:pb-0">
        <div className="absolute inset-0 hidden md:block">
          <Image
            src={heroImage.url}
            alt={heroImage.alt}
            fill
            className="object-cover"
            style={{ objectPosition: heroImage.objectPosition }}
            sizes="100vw"
            priority
            loading="eager"
            placeholder="blur"
            blurDataURL={blurDataURL}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to right, rgba(26,20,16,0.78) 0%, rgba(26,20,16,0.78) 45%, rgba(26,20,16,0.42) 50%, rgba(26,20,16,0.1) 58%, rgba(26,20,16,0) 66%)",
            }}
          />
        </div>
        <div
          className="absolute inset-0 md:hidden"
          style={{
            backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.6) 100%), url('${heroImage.url}')`,
            backgroundSize: "cover",
            backgroundPosition: heroImage.objectPosition,
          }}
        />
        <div className="relative z-20 hidden md:grid md:min-h-[100svh] md:grid-cols-[60%_40%]">
          <div className="flex items-center px-6 py-14 md:px-16">
            <div className="w-full max-w-[640px]">
              <p className="hero-anim-in hero-delay-0 mb-5 text-xs font-semibold tracking-[0.24em] text-[#E8A58F]">
                PRIVATE WELLNESS · ON DEMAND
              </p>
              <h1 className="font-serif text-[44px] leading-[0.98] text-[#F5EFE8] md:text-[72px]">
                <span className="hero-anim-in hero-delay-150 block">
                  Discover private wellness spaces near you.
                </span>
              </h1>
              <p className="hero-anim-in hero-delay-600 mt-6 max-w-sm text-[16px] leading-relaxed text-white/60">
                Book private saunas, cold plunges, float tanks and more — hosted by people in your city.
              </p>

              <div className="hero-anim-scale hero-delay-750 mt-8 flex w-full max-w-[520px] items-center gap-2 rounded-full bg-white p-2 shadow-[0_8px_40px_rgba(0,0,0,0.3)]">
                <button
                  type="button"
                  aria-label="Use my location"
                  title="Use my location"
                  onClick={handleLocateMe}
                  className="ml-1 rounded-full p-1 text-[#8D7B6F] hover:bg-[#F4EFE9]"
                >
                  <MapPin className="size-4 shrink-0" />
                </button>
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Seattle, Ballard"
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#1A1410] outline-none"
                />
                <div className="hidden sm:block">
                  <Select value={heroServiceType} onValueChange={setHeroServiceType}>
                    <SelectTrigger className="h-9 min-w-[170px] border-0 bg-transparent px-2 text-sm text-[#5F5148] shadow-none focus-visible:ring-0">
                      <SelectValue placeholder="All services" />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="all">All services</SelectItem>
                      {serviceTypes.map((serviceType) => (
                        <SelectItem key={serviceType.id} value={serviceType.id}>
                          {serviceType.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="rounded-full bg-[#C75B3A] px-5 text-white hover:bg-[#B45033]"
                  onClick={handleFindSpace}
                >
                  Find a space
                </Button>
              </div>

              <div className="hero-anim-in hero-delay-900 mt-5 flex flex-wrap items-center gap-3 text-xs text-white/40">
                <span>🔥 50+ spaces in Seattle</span>
                <span className="h-3 w-px bg-white/25" />
                <span>⭐ 4.9 avg rating</span>
                <span className="h-3 w-px bg-white/25" />
                <span>🔒 Free cancellation</span>
              </div>
            </div>
          </div>
          <div />
        </div>

        <div className="px-5 pt-2 pb-10 md:hidden">
          <p className="hero-anim-in hero-delay-0 mb-5 text-xs font-semibold tracking-[0.24em] text-[#E8A58F]">
            PRIVATE WELLNESS · ON DEMAND
          </p>
          <h1 className="font-serif text-[clamp(22px,6vw,32px)] leading-[1.2] font-bold text-[#F5EFE8]">
            <span className="hero-anim-in hero-delay-150 block">
              Discover private wellness spaces near you.
            </span>
          </h1>
          <p className="hero-anim-in hero-delay-600 mt-5 max-w-sm text-[16px] leading-relaxed text-white/60">
            Book private saunas, cold plunges, float tanks and more — hosted by people in your city.
          </p>

          <div className="hero-anim-scale hero-delay-750 mt-6 w-full rounded-[20px] bg-white px-4 pt-4 pb-5 shadow-[0_8px_40px_rgba(0,0,0,0.3)]">
            <div className="flex h-12 w-full items-center gap-2 rounded-xl border border-[#E5DDD6] bg-white px-3">
              <button
                type="button"
                aria-label="Use my location"
                title="Use my location"
                onClick={handleLocateMe}
                className="rounded-full p-1 text-[#8D7B6F] hover:bg-[#F4EFE9]"
              >
                <MapPin className="size-4 shrink-0" />
              </button>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Seattle, Ballard"
                className="h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-[16px] text-[#1A1410] outline-none"
              />
            </div>
            <div className="mt-2.5 space-y-2.5">
              <Select value={heroServiceType} onValueChange={setHeroServiceType}>
                <SelectTrigger className="h-12 w-full rounded-xl border border-[#E5DDD6] bg-white px-3 text-[16px] text-[#5F5148] shadow-none focus-visible:ring-0">
                  <SelectValue placeholder="All services" />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="all">All services</SelectItem>
                  {serviceTypes.map((serviceType) => (
                    <SelectItem key={serviceType.id} value={serviceType.id}>
                      {serviceType.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="mx-auto block h-12 w-[calc(100%-32px)] rounded-[12px] bg-[#8B4513] text-[15px] font-semibold text-white hover:bg-[#7a3d11]"
                onClick={handleFindSpace}
              >
                Find a space
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: window.innerHeight - 72, behavior: "smooth" })}
            className="mx-auto mt-4 inline-flex w-full items-center justify-center gap-1 text-center text-[12px] tracking-[0.08em] text-white/85"
          >
            <span>Explore spaces</span>
            <ChevronDown className="size-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => window.scrollTo({ top: window.innerHeight - 72, behavior: "smooth" })}
          className={`absolute bottom-6 left-1/2 z-20 hidden -translate-x-1/2 text-center text-white transition-opacity duration-300 md:block ${
            showScrollCue ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <span className="block text-[10px] tracking-[0.2em] text-white/75">EXPLORE SPACES</span>
          <span className="hero-scroll-bounce mt-1 block text-base">↓</span>
        </button>
      </section>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-8">
        <section className="space-y-3">
          <h2 className="type-h2">Trending</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {trendingCategories.map((category) => (
              <div key={category.id} className="card-base p-4">
                <p className="font-medium">
                  {category.emoji} {category.label}
                </p>
                <p className="type-label">
                  {category.tagline} · {category.priceText}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 pb-10 md:pb-14">
          <h2 className="type-h2">Wellness spaces near you</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm ${
                filter === "all" ? "border-brand-500 bg-brand-100 text-brand-900" : "bg-white text-warm-600"
              }`}
            >
              All
            </button>
            {serviceTypes.map((serviceType) => (
              <button
                key={serviceType.id}
                type="button"
                onClick={() => setFilter(serviceType.id)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm ${
                  serviceType.id === filter
                    ? "border-brand-500 bg-brand-100 text-brand-900"
                    : "bg-white text-warm-600"
                }`}
              >
                <span className="mr-1">{serviceType.icon}</span>
                {serviceType.display_name}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {skeletonCards.map((_, index) => (
                <div key={index} className="card-base animate-pulse p-3">
                  <div className="h-44 rounded-xl bg-warm-100" />
                  <div className="mt-3 h-4 w-24 rounded bg-warm-100" />
                  <div className="mt-2 h-4 w-3/4 rounded bg-warm-100" />
                  <div className="mt-2 h-4 w-1/2 rounded bg-warm-100" />
                </div>
              ))}
            </div>
          ) : (
            <ListingGrid listings={filteredListings} />
          )}
        </section>

      </main>

      <section className="bg-[#1A1410] py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="max-w-3xl space-y-5">
            <p className="text-xs tracking-[0.22em] text-[#C75B3A]">THRML JOURNAL</p>
            <h3 className="font-serif text-3xl leading-tight text-[#F5EFE8] md:text-4xl">
              Weekly wellness rituals, new spaces, and recovery inspiration.
            </h3>
            <p className="max-w-xl text-sm text-white/65">
              Join the newsletter for curated recommendations and private-space drops in your city.
            </p>

            {newsletterStatus === "success" ? (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-300/40 bg-emerald-100/10 px-4 py-3 text-[#D5F3E1]">
                <CheckCircle2 className="size-5 text-emerald-300" />
                <p className="text-sm">You're in! Check your inbox for a welcome note from us.</p>
              </div>
            ) : (
              <form onSubmit={handleNewsletterSubmit} className="w-full max-w-xl space-y-2">
                <div className="flex w-full items-center gap-3 flex-col sm:flex-row sm:items-stretch">
                  <div className="w-full flex-1">
                    <input
                      ref={newsletterInputRef}
                      type="email"
                      value={newsletterEmail}
                      onChange={(event) => {
                        setNewsletterEmail(event.target.value)
                        if (newsletterError) setNewsletterError(null)
                      }}
                      placeholder="Enter your email"
                      disabled={newsletterStatus === "loading"}
                      className="h-14 w-full rounded-full border border-white/20 bg-white px-6 text-base text-[#1A1410] outline-none placeholder:text-[#8E8176] focus:border-[#C75B3A] disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={newsletterStatus === "loading"}
                    className="h-14 w-full rounded-full bg-[#C75B3A] px-8 text-base text-white hover:bg-[#B45033] sm:w-auto md:h-14 disabled:cursor-not-allowed disabled:opacity-80"
                  >
                    {newsletterStatus === "loading" ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        Subscribing...
                      </span>
                    ) : (
                      "Subscribe"
                    )}
                  </Button>
                </div>
                {newsletterError ? (
                  <p className="px-1 text-sm text-[#F1B8A8]">{newsletterError}</p>
                ) : (
                  <p className="px-1 text-xs text-white/50">No spam. Unsubscribe anytime.</p>
                )}
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
