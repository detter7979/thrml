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
  "inline-flex h-[52px] min-h-[52px] w-full items-center justify-center rounded-full bg-[#C75B3A] px-8 text-[15px] font-medium text-white transition-colors hover:bg-[#B44D31] md:h-14 md:w-auto md:text-base"
const heroSecondaryCtaClass =
  "inline-flex h-[52px] min-h-[52px] w-full items-center justify-center rounded-full border border-white/35 bg-transparent px-8 text-[15px] font-medium text-[#F5EFE8] shadow-none transition-colors hover:bg-white/10 hover:text-[#F5EFE8] md:h-14 md:w-auto md:text-base"

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

  const heroImages = {
    mobile: {
      url: "/hero-main-bg-mobile.jpg",
      objectPosition: "center center",
      alt: "Barrel sauna glowing warmly on a backyard deck at dusk",
    },
    desktop: {
      url: "/hero-main-bg.jpg",
      objectPosition: "center center",
      alt: "Barrel sauna glowing warmly on a backyard deck at dusk",
    },
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
      <section className="relative min-h-[100svh] bg-[#1A1410]">
        <div className="pointer-events-none absolute inset-0">
          <Image
            src={heroImages.mobile.url}
            alt={heroImages.mobile.alt}
            fill
            className="object-cover scale-x-[-1] md:hidden"
            style={{ objectPosition: heroImages.mobile.objectPosition }}
            sizes="100vw"
            priority
            fetchPriority="high"
            loading="eager"
            placeholder="blur"
            blurDataURL={blurDataURL}
          />
          <Image
            src={heroImages.desktop.url}
            alt={heroImages.desktop.alt}
            fill
            className="hidden object-cover md:block"
            style={{ objectPosition: heroImages.desktop.objectPosition }}
            sizes="100vw"
            priority
            fetchPriority="high"
            loading="eager"
            placeholder="blur"
            blurDataURL={blurDataURL}
          />
          <div
            className="absolute inset-0 hidden md:block"
            style={{
              background:
                "linear-gradient(to right, rgba(26,20,16,0.78) 0%, rgba(26,20,16,0.78) 45%, rgba(26,20,16,0.42) 50%, rgba(26,20,16,0.1) 58%, rgba(26,20,16,0) 66%)",
            }}
          />
          <div className="absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-black/55 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-[52%] bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        </div>

        <div className="relative z-20 min-h-[100svh] pointer-events-none">
          {/* Top cluster — headline + subhead over darker forest */}
          <div className="absolute inset-x-0 top-[calc(25svh+env(safe-area-inset-top,0px))] px-6 text-center md:top-[14vh] md:px-8">
            <div className="mx-auto w-full max-w-6xl md:text-left">
              <div className="mx-auto max-w-[340px] md:mx-0 md:max-w-[680px]">
                <h1 className="font-serif text-[clamp(28px,7vw,44px)] font-medium leading-[1.02] tracking-tight text-[#F5EFE8] md:text-[68px] md:leading-[0.95]">
                  <span className="hero-anim-in hero-delay-150 block">Your Personal Sauna Awaits</span>
                </h1>
                <p className="hero-anim-in hero-delay-600 mx-auto mt-3 max-w-[320px] text-[15px] leading-[1.6] text-white/65 md:mx-0 md:mt-4 md:max-w-xl md:text-[18px] md:leading-[1.65]">
                  Private home saunas, booked by the hour. Browse a space near you - or list your own and earn.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom cluster — CTAs + trust line over darker foreground (~62% down) */}
          <div className="absolute inset-x-0 top-[77%] -translate-y-1/2 px-6 md:top-[62%] md:px-8">
            <div className="mx-auto w-full max-w-6xl">
              <div className="mx-auto flex max-w-[340px] flex-col items-center pointer-events-auto md:mx-0 md:max-w-[680px] md:items-start">
                <div className="hero-anim-scale hero-delay-750 flex w-full flex-col gap-3.5 md:w-auto md:flex-row md:flex-wrap md:gap-3">
                  <Button asChild className={heroPrimaryCtaClass}>
                    <Link href="/explore">Browse Saunas</Link>
                  </Button>
                  <Button asChild variant="outline" className={heroSecondaryCtaClass}>
                    <Link href="/become-a-host">Become a Host</Link>
                  </Button>
                </div>
                <p className="hero-anim-in hero-delay-900 mt-4 text-center text-xs tracking-[0.06em] text-white/45 md:text-left">
                  Private • Instant Booking • Free to list
                </p>
              </div>
            </div>
          </div>

          {/* Scroll cue — pinned bottom, separate from trust line */}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: window.innerHeight - 72, behavior: "smooth" })}
            aria-label="Scroll to explore saunas"
            className={`absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-20 inline-flex -translate-x-1/2 items-center justify-center gap-1 text-[12px] tracking-[0.08em] text-white/85 transition-opacity duration-300 pointer-events-auto md:bottom-6 md:flex-col md:gap-0 md:text-center ${
              showScrollCue ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <span className="md:hidden">Explore saunas</span>
            <ChevronDown className="size-3.5 md:hidden" aria-hidden="true" />
            <span className="hidden text-[10px] tracking-[0.2em] text-white/75 md:block">EXPLORE SAUNAS</span>
            <span className="hero-scroll-bounce mt-1 hidden text-base md:block" aria-hidden="true">
              ↓
            </span>
          </button>
        </div>
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
