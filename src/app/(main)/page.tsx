import type { Metadata } from "next"

import { isSaunasOnlyLaunch } from "@/lib/launch-config"
import { getHomeListingsForCards } from "@/lib/listings/home-listings"
import { SITE_COPY } from "@/lib/site-copy"

import { HomePageClient } from "./home-page-client"

export const revalidate = 60

export const metadata: Metadata = {
  title: { absolute: SITE_COPY.homeTitle },
  description: SITE_COPY.homeDescription,
  alternates: { canonical: "https://usethrml.com" },
}

const siteSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "thrml",
      url: "https://usethrml.com",
      description: "Peer-to-peer marketplace for private wellness spaces.",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://usethrml.com/explore?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      name: "thrml",
      url: "https://usethrml.com",
      logo: "https://usethrml.com/og-image.png",
      sameAs: [
        "https://www.instagram.com/usethrml",
        "https://www.tiktok.com/@usethrml",
      ],
    },
    {
      "@type": "LocalBusiness",
      "@id": "https://usethrml.com/#business",
      name: "thrml",
      description: SITE_COPY.schemaDescription,
      url: "https://usethrml.com",
      image: "https://usethrml.com/og-image.png",
      priceRange: "$$",
      telephone: "",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Seattle",
        addressRegion: "WA",
        addressCountry: "US",
      },
      areaServed: [{ "@type": "City", name: "Seattle" }],
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "Wellness space rentals",
        itemListElement: ([
          {
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: "Private sauna rental",
              description: "Book a private sauna session hosted by real people in your city.",
            },
          },
          {
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: "Cold plunge rental",
              description: "Access private cold plunge tubs by the session.",
            },
          },
          {
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: "Float tank rental",
              description:
                "Book private float tank sessions for sensory deprivation and recovery.",
            },
          },
          {
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: "Infrared therapy rental",
              description: "Private infrared sauna sessions available by the hour.",
            },
          },
        ]).filter(
          // During the saunas-only launch, only advertise what guests can book.
          (offer) => !isSaunasOnlyLaunch() || offer.itemOffered.name === "Private sauna rental"
        ),
      },
    },
  ],
}

export default async function HomePage() {
  const { listings, totalActiveCount } = await getHomeListingsForCards()

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteSchema) }}
      />
      <HomePageClient initialListings={listings} totalActiveListingsCount={totalActiveCount} />
    </>
  )
}
