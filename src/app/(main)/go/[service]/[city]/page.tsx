import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CalendarCheck, CreditCard, KeyRound, Lock, ShieldCheck, Undo2 } from "lucide-react"

import { ListingGrid } from "@/components/listings/ListingGrid"
import { LaunchNotifyForm } from "@/components/marketing/launch-notify-form"
import { Button } from "@/components/ui/button"
import {
  guestLaunchLabel,
  isGuestPreLaunch,
  isLaunchVisibleServiceType,
} from "@/lib/launch-config"
import {
  citySlugToDisplayName,
  fetchListingsForLocalLanding,
  getLocalSeoCopy,
  mapRowToListingCard,
  resolveServiceFromSlug,
} from "@/lib/seo/local-service-landing"
import { getServiceType } from "@/lib/constants/service-types"

/**
 * Paid-traffic landing page for guests (Meta C012 → /go/saunas/seattle).
 * Same live listings as the SEO page, but built for someone who has never heard of thrml:
 * what it is, why it's safe, and the saunas themselves on the same page. Not indexed.
 */

type PageParams = { service: string; city: string }

export const revalidate = 60

/** Below this many live listings, the launch list gets top billing. */
const THIN_INVENTORY = 3

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { service, city } = await params
  const resolved = resolveServiceFromSlug(service)
  const label = resolved ? getServiceType(resolved.serviceType)?.label ?? "Wellness space" : "Wellness space"
  return {
    title: { absolute: `Private ${label.toLowerCase()}s in ${citySlugToDisplayName(city)} | thrml` },
    description: "Book a private sauna hosted by a local, by the session. No memberships.",
    robots: { index: false, follow: false },
  }
}

const TRUST_POINTS = [
  {
    icon: ShieldCheck,
    title: "ID-verified hosts",
    body: "Every host verifies a government ID through Stripe before they can take bookings.",
  },
  {
    icon: CreditCard,
    title: "Secure checkout",
    body: "You pay through thrml. Payments are processed by Stripe, never handed to a stranger.",
  },
  {
    icon: Undo2,
    title: "Cancellation policy upfront",
    body: "Each sauna shows its cancellation policy before you pay, so there are no surprises.",
  },
  {
    icon: Lock,
    title: "Yours alone",
    body: "Book by the session. The space is private for your time — no memberships, no crowds.",
  },
] as const

const STEPS = [
  { icon: CalendarCheck, title: "Pick a sauna and a time", body: "Browse the saunas below and choose an open slot." },
  { icon: CreditCard, title: "Book in a few taps", body: "Pay securely. Your booking is confirmed right away or after the host accepts." },
  { icon: KeyRound, title: "Show up and unwind", body: "Your host sends arrival details. Message them in the app anytime." },
] as const

export default async function GuestLandingPage({ params }: { params: Promise<PageParams> }) {
  const { service, city: citySlug } = await params
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(citySlug)) notFound()

  const resolved = resolveServiceFromSlug(service)
  if (!resolved || !isLaunchVisibleServiceType(resolved.serviceType)) notFound()

  const cityDisplay = citySlugToDisplayName(citySlug)
  const label = getServiceType(resolved.serviceType)?.label ?? "Sauna"
  const labelLower = label.toLowerCase()
  const copy = getLocalSeoCopy(resolved.serviceType, citySlug)
  const rows = await fetchListingsForLocalLanding(resolved.serviceType, cityDisplay, citySlug)
  const cards = rows.map(mapRowToListingCard)
  const fromPath = `/go/${resolved.canonicalSlug}/${citySlug}`

  const preLaunch = isGuestPreLaunch()
  const launchLabel = guestLaunchLabel()
  const thin = cards.length < THIN_INVENTORY
  const leadWithList = preLaunch || thin

  return (
    <div className="bg-warm-50">
      {/* Hero */}
      <section className="bg-[#1A1410] px-5 py-14 md:px-8 md:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="type-label mb-3 text-[#E8B9A4]">
            Private {labelLower}s · {cityDisplay}
          </p>
          <h1 className="font-serif text-4xl leading-tight text-[#F5EFE8] md:text-5xl">
            Book a private {labelLower} near you, by the session.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/70">
            Backyard and home {labelLower}s hosted by locals around {cityDisplay}. The space is yours alone for
            your session — no memberships, no crowded spa.
          </p>
          {preLaunch ? (
            <p className="mx-auto mt-5 inline-block rounded-full border border-white/20 px-4 py-1.5 text-sm text-[#F5EFE8]">
              Bookings open {launchLabel}
            </p>
          ) : null}
          <div className="mt-8 flex justify-center">
            {leadWithList ? (
              <div className="flex w-full justify-center">
                <LaunchNotifyForm
                  source="guest_lp"
                  buttonLabel={preLaunch ? "Notify me" : "Tell me about new saunas"}
                  finePrint={
                    preLaunch
                      ? `One email on ${launchLabel} when bookings open. Unsubscribe anytime.`
                      : "We'll email you when new saunas open near you. Unsubscribe anytime."
                  }
                />
              </div>
            ) : (
              <Button asChild size="lg" className="rounded-full bg-[#C75B3A] px-8 text-white hover:bg-[#B44D31]">
                <a href="#saunas">See available {labelLower}s</a>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section aria-label="Why it's safe to book" className="border-b border-warm-200 bg-white px-5 py-8 md:px-8">
        <ul className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <Icon className="mt-0.5 size-5 shrink-0 text-[#C75B3A]" aria-hidden="true" />
              <div>
                <p className="font-medium text-[#1A1410]">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-warm-700">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Listings, on the page itself */}
      <section id="saunas" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-12 md:px-8 md:py-16" aria-labelledby="saunas-heading">
        <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 id="saunas-heading" className="font-serif text-2xl text-[#1A1410] md:text-3xl">
              {label}s around {cityDisplay}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-warm-700">
              Hosts are spread across the {cityDisplay} area, so plan on a short drive. Once you arrive, the whole
              space is yours for the session.
            </p>
          </div>
          {cards.length ? (
            <p className="text-sm text-[#6b5346]">
              {cards.length} {cards.length === 1 ? labelLower : `${labelLower}s`} listed
            </p>
          ) : null}
        </div>

        {cards.length ? (
          <ListingGrid listings={cards} fromPath={fromPath} prioritizeFirstImage enableScrollReveal={false} />
        ) : (
          <div className="rounded-2xl border border-dashed border-warm-200 bg-white/80 p-10 text-center">
            <h3 className="font-serif text-xl text-[#1A1410]">The first {labelLower}s are being set up now</h3>
            <p className="mx-auto mt-3 max-w-lg text-warm-700">
              Leave your email above and we&apos;ll tell you as soon as you can book one.
            </p>
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="border-t border-warm-200 bg-white px-5 py-12 md:px-8 md:py-16" aria-labelledby="how-heading">
        <div className="mx-auto max-w-6xl">
          <h2 id="how-heading" className="font-serif text-2xl text-[#1A1410] md:text-3xl">
            How it works
          </h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F5EFE8] text-[#C75B3A]">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-medium text-[#1A1410]">
                    {index + 1}. {title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-warm-700">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 py-12 md:px-8 md:py-16" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="font-serif text-2xl text-[#1A1410] md:text-3xl">
          Questions
        </h2>
        <dl className="mt-6 space-y-6">
          {copy.faq.map((item) => (
            <div key={item.question} className="border-b border-warm-100 pb-6 last:border-0">
              <dt className="font-medium text-[#1A1410]">{item.question}</dt>
              <dd className="mt-2 text-warm-700">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Closing CTA: same single action as the hero */}
      <section className="bg-[#1A1410] px-5 py-14 md:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <h2 className="font-serif text-3xl text-[#F5EFE8]">
            {leadWithList ? (preLaunch ? `Bookings open ${launchLabel}` : "More saunas are on the way") : "Find your session"}
          </h2>
          <div className="mt-6 flex w-full justify-center">
            {leadWithList ? (
              <LaunchNotifyForm source="guest_lp" buttonLabel="Notify me" />
            ) : (
              <Button asChild size="lg" className="rounded-full bg-[#C75B3A] px-8 text-white hover:bg-[#B44D31]">
                <Link href="#saunas">See available {labelLower}s</Link>
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
