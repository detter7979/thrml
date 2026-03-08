import { Suspense } from "react"

import { ExploreClient } from "./explore-client"

export default async function ExplorePage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100svh-88px)] bg-[#F7F3EE]" />}>
      <ExploreClient />
    </Suspense>
  )
}
