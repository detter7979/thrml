import type { Metadata } from "next"

import { HomePageClient } from "./home-page-client"

export const metadata: Metadata = {
  title: "thrml — Book Private Saunas, Cold Plunges & Wellness Spaces",
  description:
    "Book private saunas, cold plunges, float tanks, infrared therapy and more — hosted by real people in Seattle and Los Angeles. No memberships. No front desks.",
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
    },
  ],
}

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteSchema) }}
      />
      <HomePageClient />
    </>
  )
}
