"use client"

import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { Loader2 } from "lucide-react"

import { StarRating } from "@/components/reviews/StarRating"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { REVIEW_TONE_BY_RATING } from "@/lib/reviews"

export type GuestReviewSuccess = {
  reviewId: string
  rating: number
  comment: string | null
}

type GuestReviewFormProps = {
  bookingId: string
  guestName: string
  initialStars?: number
  active?: boolean
  submitLabel?: string
  footer?: ReactNode
  onSuccess: (result: GuestReviewSuccess) => void
}

export function GuestReviewForm({
  bookingId,
  guestName,
  initialStars = 0,
  active = true,
  submitLabel = "Submit rating",
  footer,
  onSuccess,
}: GuestReviewFormProps) {
  const [overall, setOverall] = useState(0)
  const [overallHover, setOverallHover] = useState<number | null>(null)
  const [comment, setComment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!active) return
    const next = Math.max(0, Math.min(5, Math.round(initialStars)))
    setOverall(next)
    setOverallHover(null)
    setComment("")
    setErrorMessage(null)
    setIsSubmitting(false)
  }, [active, initialStars, bookingId])

  const shownOverall = overallHover ?? overall
  const overallTone = shownOverall ? REVIEW_TONE_BY_RATING[shownOverall] : "Tap a star rating above"
  const canSubmit = overall > 0 && !isSubmitting
  const commentTrimmed = comment.trim()
  const safeGuestName = guestName.trim() || "this guest"

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const response = await fetch("/api/guest-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          ratingOverall: overall,
          comment: commentTrimmed || null,
        }),
      })

      const payload = (await response.json()) as { error?: string; review_id?: string }
      if (!response.ok) throw new Error(payload.error ?? "Unable to post review")

      const reviewId = payload.review_id
      if (!reviewId) throw new Error("Unable to post review")

      onSuccess({
        reviewId,
        rating: overall,
        comment: commentTrimmed || null,
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to post review")
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[#8A796B]">Overall</p>
        <StarRating
          value={shownOverall}
          interactive
          size={32}
          className="gap-1.5"
          onHoverChange={(value) => setOverallHover(value)}
          onChange={(value) => setOverall(value)}
        />
        <p className={`font-serif text-sm italic ${overall ? "text-[#C75B3A]" : "text-[#9D8D80]"}`}>
          {overallTone}
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor={`guest-review-comment-${bookingId}`} className="text-sm font-medium text-[#1A1410]">
          Note for other hosts <span className="font-normal text-[#9D8D80]">(optional)</span>
        </label>
        <Textarea
          id={`guest-review-comment-${bookingId}`}
          value={comment}
          maxLength={1000}
          placeholder={`Anything other hosts should know about ${safeGuestName}?`}
          className="min-h-[100px] resize-y rounded-xl border-[#E2D8CC] bg-white text-sm text-[#2C231D]"
          onChange={(e) => setComment(e.target.value)}
        />
        <p className="text-xs text-[#9D8D80]">Only visible to other hosts — not shown on public profiles.</p>
        {comment.length > 0 ? (
          <p className={`text-xs ${comment.length >= 1000 ? "text-rose-700" : "text-[#9D8D80]"}`}>
            {comment.length}/1000
          </p>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
      ) : null}

      {footer ?? (
        <Button
          type="submit"
          disabled={!canSubmit}
          className="h-11 w-full rounded-xl bg-[#C75B3A] text-base font-semibold text-white hover:bg-[#B24E31]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Submitting…
            </>
          ) : (
            submitLabel
          )}
        </Button>
      )}
    </form>
  )
}
