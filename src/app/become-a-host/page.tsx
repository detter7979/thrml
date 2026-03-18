import { Suspense } from "react"
import type { Metadata } from "next"

import { BecomeAHostClient } from "./become-a-host-client"

export const metadata: Metadata = {
  title: "Become a Host — List Your Wellness Space",
  description:
    "Earn passive income by listing your private sauna, cold plunge, or wellness space on thrml. Free to list. You keep 88%.",
  alternates: { canonical: "https://usethrml.com/become-a-host" },
  openGraph: {
    type: "website",
    title: "Become a thrml Host",
    description: "List your private wellness space and start earning. Free to list.",
    url: "https://usethrml.com/become-a-host",
  },
}

export default function BecomeAHostPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-neutral-400">
          Loading...
        </div>
      }
    >
      <BecomeAHostClient />
    </Suspense>
  )
}
