import { Suspense } from "react"

import { BecomeAHostClient } from "./become-a-host-client"

export const metadata = {
  title: "Become a Host | thrml",
  description:
    "Earn passive income from your sauna, cold plunge, or wellness space. List on thrml in minutes.",
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
