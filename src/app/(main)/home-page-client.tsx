"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import Image from "next/image"
import Link from "next/link"
import { CheckCircle2, ChevronDown, Loader2 } from "lucide-react"

const ListingGrid = dynamic(
  () => import("@/components/listings/ListingGrid").then((m) => m.ListingGrid),
  { ssr: true }
)
import { trackMetaEvent } from "@/components/meta-pixel"
import { Button } from "@/components/ui/button"
import {
  FALLBACK_SERVICE_TYPES,
  isServiceTypeId,
  type ServiceTypeMeta,
} from "@/lib/service-types"
import { trackGaEvent } from "@/lib/analytics/ga"
import { isSaunasOnlyLaunch } from "@/lib/launch-config"
import { useScrollReveal } from "@/hooks/useScrollReveal"
import { pickPrimaryListingPhotoUrl } from "@/lib/listings/listing-photos"
import type { HomeListingCardRow } from "@/lib/listings/home-listings"

const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const heroPrimaryCtaClass =
  "inline-flex h-14 min-h-14 items-center justify-center rounded-full bg-[#C75B3A] px-8 text-base font-medium text-white transition-colors hover:bg-[#B44D31] md:h-14"
const heroSecondaryCtaClass =
  "inline-flex h-14 min-h-14 items-center justify-center rounded-full border border-white/35 bg-transparent px-8 text-base font-medium text-[#F5EFE8] shadow-none transition-colors hover:bg-white/10 hover:text-[#F5EFE8] md:h-14"

type HomePageClientProps = {
  initialListings: HomeListingCardRow[]
  totalActiveListingsCount: number
}

export function HomePageClient({ initialListings }: HomePageClientProps) {
  const [newsletterEmail, setNewsletterEmail] = useState("")
  const [newsletterStatus, setNewsletterStatus] = useState<"idle" | "loading" | "success">("idle")
  const [newsletterError, setNewsletterError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>(isSaunasOnlyLaunch() ? "sauna" : "all")
  const [listings] = useState<HomeListingCardRow[]>(initialListings)
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeMeta[]>(FALLBACK_SERVICE_TYPES)
  const loading = false
  const [showScrollCue, setShowScrollCue] = useState(true)
  const newsletterInputRef = useRef<HTMLInputElement>(null)
  const listingsRef = useScrollReveal<HTMLElement>()

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
        const matchesLaunchScope = isSaunasOnlyLaunch() ? listingServiceType === "sauna" : true
        const matchesFilter = filter === "all" || listingServiceType === filter
        return matchesLaunchScope && matchesFilter
      })
      .map((item) => {
        const serviceTypeId =
          typeof item.service_type === "string" && isServiceTypeId(item.service_type)
            ? item.service_type
            : "sauna"
        const serviceTypeMeta = serviceTypeMap.get(serviceTypeId)

        return {
          id: item.id,
          title: item.title ?? "thrml Listing",
          location: item.location ?? "Location available after booking",
          serviceTypeName: serviceTypeMeta?.display_name ?? "Sauna",
          serviceTypeIcon: serviceTypeMeta?.icon ?? "🔥",
          bookingModel: serviceTypeMeta?.booking_model ?? "hourly",
          photoUrl: pickPrimaryListingPhotoUrl(item.listing_photos),
          priceSolo: Number(item.price_solo ?? 0),
          rating: Number(item.listing_ratings?.[0]?.avg_overall ?? 0) || undefined,
          reviewCount: Number(item.listing_ratings?.[0]?.review_count ?? 0) || undefined,
        }
      })
  }, [filter, listings, serviceTypeMap])

  const skeletonCards = new Array(6).fill(null)
  const blurDataURL =
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL..."

  const heroImage = {
    url: "/hero-main-bg.png",
    objectPosition: "center center",
    alt: "Outdoor wooden sauna glowing at dusk with autumn foliage",
  }

  async function handleNewsletterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newsletterStatus !== "idle") return
    const formData = new FormData(event.currentTarget)
    const website = typeof formData.get("website") === "string" ? (formData.get("website") as string).trim() : ""

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
        body: JSON.stringify({ email, website }),
      })

      if (!response.ok) {
        throw new Error("Newsletter subscribe request failed")
      }

      trackGaEvent("newsletter_subscribe", {
        source: "home_page",
      })
      trackMetaEvent("Lead", {
        content_name: "newsletter_subscribe",
      })
      setNewsletterStatus("success")
      setNewsletterEmail("")
    } catch {
      setNewsletterStatus("idle")
      setNewsletterError("Something went wrong. Please try again.")
    }
  }

  return (
    <div className="min-h-screen bg-warm-50">
      <section className="relative min-h-[100svh] bg-[#1A1410] pt-24 pb-8 md:min-h-[100svh] md:pt-0 md:pb-0">
        <div className="pointer-events-none absolute inset-0 hidden md:block">
          <Image
            src={heroImage.url}
            alt={heroImage.alt}
            fill
            className="pointer-events-none object-cover"
            style={{ objectPosition: heroImage.objectPosition }}
            sizes="(max-width: 767px) 0px, (max-width: 1280px) 100vw, 100vw"
            quality={68}
            priority
            fetchPriority="high"
            loading="eager"
            placeholder="blur"
            blurDataURL={blurDataURL}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to right, rgba(26,20,16,0.78) 0%, rgba(26,20,16,0.78) 45%, rgba(26,20,16,0.42) 50%, rgba(26,20,16,0.1) 58%, rgba(26,20,16,0) 66%)",
            }}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 md:hidden">
          <Image
            src={heroImage.url}
            alt={heroImage.alt}
            fill
            className="pointer-events-none object-cover"
            style={{ objectPosition: heroImage.objectPosition }}
            sizes="100vw"
            quality={68}
            priority
            fetchPriority="high"
            loading="eager"
            placeholder="blur"
            blurDataURL={blurDataURL}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: "linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.6) 100%)",
            }}
          />
        </div>
        <div className="relative z-20 hidden pointer-events-auto md:flex md:min-h-[100svh] md:items-center">
          <div className="mx-auto w-full max-w-6xl px-4 md:px-8">
            <div className="w-full max-w-[680px]">
              <h1 className="font-serif text-[44px] font-medium leading-[0.95] tracking-tight text-[#F5EFE8] md:text-[68px]">
                <span className="hero-anim-in hero-delay-150 block">Your Personal Sauna Awaits</span>
              </h1>
              <p className="hero-anim-in hero-delay-600 mt-8 max-w-xl text-[17px] leading-[1.65] text-white/65 md:text-[18px]">
                Private home saunas, booked by the hour. Browse a space near you - or list your own
                and earn.
              </p>

              <div className="hero-anim-scale hero-delay-750 mt-10 flex flex-wrap items-center gap-3">
                <Button asChild className={heroPrimaryCtaClass}>
                  <Link href="/explore">Browse Saunas</Link>
                </Button>
                <Button asChild variant="outline" className={heroSecondaryCtaClass}>
                  <Link href="/become-a-host">Become a Host</Link>
                </Button>
              </div>

              <p className="hero-anim-in hero-delay-900 mt-6 text-xs tracking-[0.06em] text-white/45">
                Private • Instant Booking • Host Earnings up to $2,000+/mo
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-20 mx-auto max-w-6xl px-4 pt-2 pb-10 pointer-events-auto md:hidden">
          <h1 className="font-serif text-[clamp(32px,8vw,44px)] font-medium leading-[0.98] tracking-tight text-[#F5EFE8]">
            <span className="hero-anim-in hero-delay-150 block">Your Personal Sauna Awaits</span>
          </h1>
          <p className="hero-anim-in hero-delay-600 mt-6 max-w-xl text-[16px] leading-[1.65] text-white/65">
            Private home saunas, booked by the hour. Browse a space near you - or list your own and
            earn.
          </p>

          <div className="hero-anim-scale hero-delay-750 mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild className={`${heroPrimaryCtaClass} w-full sm:w-auto`}>
              <Link href="/explore">Browse Saunas</Link>
            </Button>
            <Button asChild variant="outline" className={`${heroSecondaryCtaClass} w-full sm:w-auto`}>
              <Link href="/become-a-host">Become a Host</Link>
            </Button>
          </div>

          <p className="hero-anim-in hero-delay-900 mt-5 text-xs leading-relaxed tracking-[0.04em] text-white/45">
            Private • Instant Booking • Host Earnings up to $2,000+/mo
          </p>

          <button
            type="button"
            onClick={() => window.scrollTo({ top: window.innerHeight - 72, behavior: "smooth" })}
            className="mx-auto mt-6 inline-flex w-full items-center justify-center gap-1 text-center text-[12px] tracking-[0.08em] text-white/85"
          >
            <span>Explore saunas</span>
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
          <span className="block text-[10px] tracking-[0.2em] text-white/75">EXPLORE SAUNAS</span>
          <span className="hero-scroll-bounce mt-1 block text-base">↓</span>
        </button>
      </section>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-8">
        <section ref={listingsRef} className="space-y-3 pb-10 md:pb-14">
          <h2 className="type-h2 reveal">Wellness spaces near you</h2>
          {!isSaunasOnlyLaunch() ? (
            <div className="flex gap-2 overflow-x-auto pb-1 snap-x-pills">
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
          ) : null}
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {skeletonCards.map((_, index) => (
                <div key={index} className="card-base animate-pulse p-3">
                  <div className="aspect-[4/3] rounded-xl bg-warm-100" />
                  <div className="mt-3 h-4 w-24 rounded bg-warm-100" />
                  <div className="mt-2 h-4 w-3/4 rounded bg-warm-100" />
                  <div className="mt-2 h-4 w-1/2 rounded bg-warm-100" />
                </div>
              ))}
            </div>
          ) : (
            <ListingGrid listings={filteredListings} fromPath="/" />
          )}
        </section>

      </main>

      <section className="bg-[#1A1410] py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <h3 className="mb-4 font-serif text-3xl leading-tight text-[#F5EFE8] md:text-4xl">
            Don&apos;t miss a session
          </h3>
          <p className="mb-8 max-w-xl text-base leading-relaxed text-white/65">
            New listings near you, helpful hosting tips for hosts, and the occasional exclusive offer — delivered straight to your inbox.
          </p>

          {newsletterStatus === "success" ? (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-300/40 bg-emerald-100/10 px-4 py-3 text-[#D5F3E1]">
              <CheckCircle2 className="size-5 text-emerald-300" />
              <p className="text-sm">You&apos;re in! Check your inbox for a welcome note from us.</p>
            </div>
          ) : (
            <form onSubmit={handleNewsletterSubmit} className="w-full max-w-xl space-y-2">
              {/* Honeypot - hidden from real users, bots will fill this */}
              <input
                type="text"
                id="newsletter-honeypot"
                name="website"
                autoComplete="off"
                tabIndex={-1}
                aria-hidden="true"
                style={{ display: "none" }}
              />
              <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:items-stretch">
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
                    aria-label="Email for newsletter"
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
                      Joining...
                    </span>
                  ) : (
                    "Join the Ritual"
                  )}
                </Button>
              </div>
              {newsletterError ? (
                <p className="mt-3 px-1 text-sm text-[#F1B8A8]">{newsletterError}</p>
              ) : (
                <p className="mt-3 px-1 text-xs text-white/50">Occasional emails only. No spam.</p>
              )}
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
