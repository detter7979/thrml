import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { ListingGrid } from "@/components/listings/ListingGrid"
import { Button } from "@/components/ui/button"
import {
  citySlugToDisplayName,
  fetchListingsForLocalLanding,
  getAppOrigin,
  getLocalSeoCopy,
  mapRowToListingCard,
  resolveServiceFromSlug,
  SERVICE_CANONICAL_SLUG,
  type LocalListingRow,
} from "@/lib/seo/local-service-landing"
import { getServiceType, type ServiceType } from "@/lib/constants/service-types"

type PageParams = { service: string; city: string }

/** Always query Supabase at request time so we never ship a build-time empty grid from CI. */
export const dynamic = "force-dynamic"

export function generateStaticParams() {
  return [
    { service: SERVICE_CANONICAL_SLUG.sauna, city: "seattle" },
    { service: SERVICE_CANONICAL_SLUG.cold_plunge, city: "seattle" },
    { service: SERVICE_CANONICAL_SLUG.float_tank, city: "seattle" },
  ]
}

function isValidCitySlug(city: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(city)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>
}): Promise<Metadata> {
  const { service: serviceSegment, city: citySlug } = await params
  const resolved = resolveServiceFromSlug(serviceSegment)
  if (!resolved || !isValidCitySlug(citySlug)) {
    return { title: "Not found" }
  }

  const cityDisplay = citySlugToDisplayName(citySlug)
  const copy = getLocalSeoCopy(resolved.serviceType, citySlug)
  const origin = getAppOrigin()
  const path = `/${resolved.canonicalSlug}/${citySlug}`
  const url = `${origin}${path}`

  const rows = await fetchListingsForLocalLanding(resolved.serviceType, cityDisplay, citySlug)
  const hasListings = rows.length > 0

  return {
    title: { absolute: copy.title },
    description: copy.description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: copy.title,
      description: copy.description,
      siteName: "thrml",
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
    },
    robots: hasListings ? { index: true, follow: true } : { index: false, follow: true },
    other: {
      "geo.placename": cityDisplay,
    },
  }
}

function buildJsonLd(args: {
  origin: string
  path: string
  copy: ReturnType<typeof getLocalSeoCopy>
  serviceType: ServiceType
  cityDisplay: string
  listings: LocalListingRow[]
}) {
  const { origin, path, copy, serviceType, cityDisplay, listings } = args
  const pageUrl = `${origin}${path}`
  const serviceLabel = getServiceType(serviceType)?.label ?? serviceType.replace(/_/g, " ")
  const serviceLabelLower = serviceLabel.toLowerCase()

  const collectionItemElements = listings.slice(0, 10).map((row, index) => {
    const listingUrl = `${origin}/listings/${row.id}`
    const name =
      typeof row.title === "string" && row.title.trim() ? row.title : "Wellness space"
    return {
      "@type": "ListItem",
      position: index + 1,
      url: listingUrl,
      name,
    }
  })

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: "thrml",
        url: origin,
        description:
          "Peer-to-peer marketplace to book private saunas, cold plunges, float tanks, and other wellness spaces by the hour or session.",
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: origin,
        name: "thrml",
        publisher: { "@id": `${origin}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${origin}/explore?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "CollectionPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: `Private ${serviceLabel} rentals in ${cityDisplay}`,
        description: `Book private ${serviceLabelLower} sessions hosted by real people in ${cityDisplay}. No memberships required.`,
        isPartOf: { "@id": `${origin}/#website` },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: collectionItemElements.length,
          itemListElement: collectionItemElements,
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        mainEntity: copy.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  }
}

export default async function LocalServiceCityPage({ params }: { params: Promise<PageParams> }) {
  const { service: serviceSegment, city: citySlug } = await params

  if (!isValidCitySlug(citySlug)) notFound()

  const resolved = resolveServiceFromSlug(serviceSegment)
  if (!resolved) notFound()

  if (resolved.needsRedirect) {
    redirect(`/${resolved.canonicalSlug}/${citySlug}`)
  }

  const cityDisplay = citySlugToDisplayName(citySlug)
  const copy = getLocalSeoCopy(resolved.serviceType, citySlug)
  const rows = await fetchListingsForLocalLanding(resolved.serviceType, cityDisplay, citySlug)
  const cards = rows.map(mapRowToListingCard)
  const origin = getAppOrigin()
  const path = `/${resolved.canonicalSlug}/${citySlug}`
  const fromPath = path

  const jsonLd = buildJsonLd({
    origin,
    path,
    copy,
    serviceType: resolved.serviceType,
    cityDisplay,
    listings: rows,
  })

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="mx-auto max-w-6xl px-4 py-10 md:px-8 md:py-14">
        <header className="mx-auto max-w-3xl text-center">
          <p className="type-label mb-3 text-[#6b5346]">thrml · {cityDisplay}</p>
          <h1 className="font-serif text-4xl leading-tight text-[#1A1410] md:text-5xl">{copy.h1}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-warm-700">{copy.subtitle}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href={copy.ctaHref}>{copy.ctaLabel}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/become-a-host">List your space</Link>
            </Button>
          </div>
        </header>

        <section className="mt-14" aria-labelledby="listings-heading">
          <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <h2 id="listings-heading" className="font-serif text-2xl text-[#1A1410] md:text-3xl">
              Available in {cityDisplay}
            </h2>
            <p className="text-sm text-[#6b5346]">
              {cards.length} {cards.length === 1 ? "space" : "spaces"} match this search
            </p>
          </div>

          {cards.length ? (
            <ListingGrid
              listings={cards}
              fromPath={fromPath}
              prioritizeFirstImage
              enableScrollReveal={false}
            />
          ) : (
            <div className="card-base rounded-2xl border border-dashed border-warm-200 bg-white/80 p-10 text-center">
              <h3 className="font-serif text-xl text-[#1A1410]">{copy.emptyStateTitle}</h3>
              <p className="mx-auto mt-3 max-w-lg text-warm-700">{copy.emptyStateBody}</p>
              <Button asChild className="mt-6">
                <Link href="/become-a-host">Start hosting</Link>
              </Button>
            </div>
          )}
        </section>

        <section className="mt-16 border-t border-warm-200 pt-12" aria-labelledby="guide-heading">
          <h2 id="guide-heading" className="font-serif text-2xl text-[#1A1410] md:text-3xl">
            Why book on thrml
          </h2>
          <div
            className="mt-6 max-w-3xl space-y-4 leading-relaxed text-warm-800 [&_strong]:text-[#1A1410]"
            dangerouslySetInnerHTML={{ __html: copy.introHtml }}
          />
          <p className="mt-4 text-sm leading-relaxed text-warm-700">{copy.secondaryKeywordsLine}</p>
        </section>

        <section className="mt-14" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="font-serif text-2xl text-[#1A1410] md:text-3xl">
            Frequently asked questions
          </h2>
          <dl className="mt-8 space-y-8">
            {copy.faq.map((item) => (
              <div key={item.question} className="border-b border-warm-100 pb-8 last:border-0">
                <dt className="font-medium text-[#1A1410]">{item.question}</dt>
                <dd className="mt-2 text-warm-700">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </article>
    </>
  )
}
