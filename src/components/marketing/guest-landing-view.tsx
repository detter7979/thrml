import Image from "next/image"
import Link from "next/link"

import type { ListingCardData } from "@/components/listings/ListingCard"
import { GuestBookBar } from "@/components/marketing/guest-book-bar"
import { GuestSpaceMosaic } from "@/components/marketing/guest-space-mosaic"
import { LaunchNotifyForm } from "@/components/marketing/launch-notify-form"
import {
  guestListingHref,
  guestPlaceLabel,
  guestPriceLabel,
  type GuestLandingMode,
} from "@/lib/marketing/guest-landing"
import { listingPhotoThumbnailUrl } from "@/lib/listings/thumbnail-url"

const PAGE = "#f7f3ee"
const HERO_WASH = `linear-gradient(to bottom, rgba(26,20,16,0.5) 0%, rgba(26,20,16,0.05) 28%, rgba(247,243,238,0) 46%, rgba(247,243,238,0.72) 72%, ${PAGE} 88%, ${PAGE} 100%)`

const GUEST_QUESTIONS = [
  {
    q: "What should I bring?",
    a: "Towels, water, and sandals are the usual. Each sauna says what is already there, and any house rules, before you book.",
  },
  {
    q: "How do I get in?",
    a: "Your confirmation has the arrival notes. Some hosts use a lockbox or a door code, others a short handoff. The listing says which, and you can message them in the app.",
  },
  {
    q: "What if I need to cancel?",
    a: "The cancellation rule is on the sauna before you pay. You see it, then you book.",
  },
] as const

export function GuestLandingView({
  mode,
  cityDisplay,
  labelLower,
  preLaunch,
  launchLabel,
  featured,
  rest,
  early,
  fromPath,
  marketCity,
  marketState,
}: {
  mode: GuestLandingMode
  cityDisplay: string
  labelLower: string
  preLaunch: boolean
  launchLabel: string
  featured: ListingCardData | null
  rest: ListingCardData[]
  early: ListingCardData[]
  fromPath: string
  marketCity: string
  marketState: string | null
}) {
  const catalog = mode === "catalog" && featured
  const featuredHref = featured ? guestListingHref(featured.id, fromPath) : null
  const featuredPlace = featured ? guestPlaceLabel(featured) : null
  const featuredPrice = featured ? guestPriceLabel(featured) : null
  const heroSrc = catalog
    ? listingPhotoThumbnailUrl(featured.photoUrl, { width: 1800, quality: 72 }) || featured.photoUrl || "/hero-main-bg.jpg"
    : "/hero-main-bg.jpg"
  const heroAlt = catalog
    ? featuredPlace
      ? `${featured.title} in ${featuredPlace}`
      : featured.title
    : "A barrel sauna glowing on a backyard deck at dusk, with string lights in the trees"

  const notifyFinePrint = preLaunch
    ? `One email on ${launchLabel} when bookings open. Unsubscribe anytime.`
    : `A note when a new ${labelLower} opens near ${cityDisplay}. Unsubscribe anytime.`

  return (
    <div className="bg-[#f7f3ee] text-[#1A1410]">
      <section>
        <div className="relative h-[46svh] min-h-[300px] md:h-[64svh]">
          <Image
            src={heroSrc}
            alt={heroAlt}
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: catalog ? "center center" : "center 40%" }}
          />
          <div className="absolute inset-0" style={{ background: HERO_WASH }} />
        </div>
        <div className="relative z-10 mx-auto -mt-10 max-w-6xl px-5 md:-mt-16 md:px-8">
          <p className="text-[13px] font-medium tracking-[0.16em] text-[#6b5346] uppercase">
            Private {labelLower}s · {cityDisplay}
          </p>
          <h1 className="mt-3 max-w-3xl font-serif text-[clamp(2.6rem,6.4vw,4.75rem)] leading-[0.96] tracking-tight">
            Book a private {labelLower} near you, by the session.
          </h1>
          {catalog ? (
            <div className="mt-6 max-w-xl">
              <p className="text-lg text-[#3d332c]">
                <Link href={featuredHref!} className="underline decoration-[#C75B3A]/50 underline-offset-4">
                  {featured.title}
                </Link>
                {featuredPlace ? <span> · {featuredPlace}</span> : null}
              </p>
              {featuredPrice ? <p className="mt-1 text-[#1A1410]">{featuredPrice}</p> : null}
              <Link
                href={featuredHref!}
                className="mt-6 inline-flex h-14 items-center rounded-full bg-[#C75B3A] px-8 text-base font-medium text-white hover:bg-[#B44D31]"
              >
                View times
              </Link>
            </div>
          ) : (
            <div className="mt-6 max-w-xl">
              <p className="max-w-md text-lg leading-relaxed text-[#3d332c]">
                Backyard {labelLower}s hosted by people around {cityDisplay}. The hour is yours.
              </p>
              {preLaunch && early.length === 0 ? (
                <p className="mt-3 text-sm text-[#6b5346]">Bookings open {launchLabel}.</p>
              ) : null}
              <div className="mt-6">
                <LaunchNotifyForm
                  source="guest_lp"
                  tone="light"
                  buttonLabel={preLaunch ? "Notify me" : "Email me"}
                  finePrint={notifyFinePrint}
                  successMessage={
                    preLaunch
                      ? `You're on the list. We'll email you on ${launchLabel}.`
                      : `You're on the list. We'll write when a new ${labelLower} opens near ${cityDisplay}.`
                  }
                  marketCity={marketCity}
                  marketState={marketState ?? undefined}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {catalog ? (
        <>
          {rest.length ? (
            <div>
              <p className="mx-auto max-w-6xl px-5 pt-4 font-serif text-2xl text-[#1A1410] md:px-8 md:text-3xl">
                And a few more.
              </p>
              <GuestSpaceMosaic listings={rest} fromPath={fromPath} />
            </div>
          ) : null}
          <p className="mx-auto max-w-6xl px-5 py-8 font-serif text-[clamp(1.6rem,3vw,2.35rem)] leading-snug md:px-8 md:py-12">
            Every host checks in with a government ID through Stripe. You pay thrml, and the cancellation rule is
            on the listing before you pay.
          </p>
          <section className="mx-auto max-w-2xl px-5 py-8 md:px-8 md:py-12" aria-labelledby="guest-questions">
            <h2 id="guest-questions" className="font-serif text-3xl">
              Before you go
            </h2>
            <div className="mt-8 border-b border-[#1A1410]/10">
              {GUEST_QUESTIONS.map((item) => (
                <details key={item.q} className="group border-t border-[#1A1410]/10 py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-serif text-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C75B3A] [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span aria-hidden="true" className="text-2xl leading-none text-[#6b5346] motion-safe:transition motion-safe:group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-lg leading-relaxed text-[#5c5148]">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
          <section className="mx-auto max-w-6xl px-5 pt-8 pb-28 md:px-8 md:pb-24">
            <div className="border-t border-[#1A1410]/10 pt-14 md:flex md:items-end md:justify-between md:gap-16">
              <div className="max-w-sm">
                <h2 className="font-serif text-3xl leading-tight md:text-4xl">New {labelLower}s near {cityDisplay}</h2>
                <p className="mt-3 text-lg text-[#5c5148]">A note when another one opens, and the occasional tip.</p>
              </div>
              <div className="mt-8 md:mt-0 md:w-[28rem] md:shrink-0">
                <LaunchNotifyForm
                  source="guest_lp"
                  tone="light"
                  buttonLabel="Email me"
                  finePrint={notifyFinePrint}
                  successMessage={`You're on the list. We'll write when a new ${labelLower} opens near ${cityDisplay}.`}
                  marketCity={marketCity}
                  marketState={marketState ?? undefined}
                />
              </div>
            </div>
          </section>
          {featuredHref ? <GuestBookBar href={featuredHref} price={featuredPrice} /> : null}
        </>
      ) : (
        <>
          <section className="relative mt-16 h-[62vh] min-h-[420px] md:mt-24">
            <Image
              src="/hero-sauna.png"
              alt="A wood-fired barrel sauna open in a cedar forest, light spilling from the doorway"
              fill
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#1A1410]/75 via-[#1A1410]/25 to-transparent" />
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to bottom, ${PAGE} 0%, rgba(247,243,238,0) 18%, rgba(247,243,238,0) 68%, ${PAGE} 100%)`,
              }}
            />
            <p className="absolute top-[24%] left-5 max-w-xs font-serif text-4xl leading-tight text-[#F5EFE8] md:left-8 md:max-w-sm md:text-5xl">
              The hour is yours alone.
            </p>
          </section>
          <p className="mx-auto max-w-6xl px-5 py-16 font-serif text-[clamp(1.6rem,3vw,2.35rem)] leading-snug md:px-8 md:py-24">
            Every host checks in with a government ID through Stripe. You pay thrml, and the cancellation rule is
            on the listing before you pay.
          </p>
          {early.length ? (
            <GuestSpaceMosaic
              listings={early}
              fromPath={fromPath}
              heading={`Open around ${cityDisplay}`}
              lede="A few are ready. The rest are on the way."
            />
          ) : null}
        </>
      )}
    </div>
  )
}
