import { Suspense } from "react"
import type { Metadata } from "next"

import { ExploreClient } from "./explore-client"

export const metadata: Metadata = {
  title: "Explore Private Wellness Spaces — Saunas, Cold Plunges & More",
  description:
    "Browse and book private saunas, cold plunges, infrared rooms, float tanks and more in Seattle, Los Angeles, and beyond.",
  alternates: { canonical: "https://usethrml.com/explore" },
  robots: { index: true, follow: true },
}

export default async function ExplorePage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100svh-88px)] bg-[#F7F3EE]" />}>
      <ExploreClient />
    </Suspense>
  )
}
