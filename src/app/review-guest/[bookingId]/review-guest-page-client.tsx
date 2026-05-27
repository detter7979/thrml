"use client"

import { useRouter } from "next/navigation"

import { GuestReviewForm } from "@/components/booking/GuestReviewForm"

export function ReviewGuestPageClient({
  bookingId,
  guestName,
  initialRating,
}: {
  bookingId: string
  guestName: string
  initialRating: number
}) {
  const router = useRouter()

  return (
    <GuestReviewForm
      bookingId={bookingId}
      guestName={guestName}
      initialStars={initialRating}
      active
      onSuccess={() => {
        router.push(`/dashboard/listings?toast=${encodeURIComponent("Thanks for rating your guest")}`)
        router.refresh()
      }}
    />
  )
}
