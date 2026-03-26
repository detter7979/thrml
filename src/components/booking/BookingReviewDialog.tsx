"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { StarRating } from "@/components/reviews/StarRating"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { REVIEW_TONE_BY_RATING } from "@/lib/reviews"

export type BookingReviewSuccess = {
  reviewId: string
  rating: number
  comment: string | null
}

type BookingReviewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  listingId: string
  listingTitle: string
  initialStars?: number
  onSuccess: (result: BookingReviewSuccess) => void
}

export function BookingReviewDialog({
  open,
  onOpenChange,
  bookingId,
  listingId,
  listingTitle,
  initialStars = 0,
  onSuccess,
}: BookingReviewDialogProps) {
  const [overall, setOverall] = useState(0)
  const [overallHover, setOverallHover] = useState<number | null>(null)
  const [comment, setComment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const next = Math.max(0, Math.min(5, Math.round(initialStars)))
    setOverall(next)
    setOverallHover(null)
    setComment("")
    setErrorMessage(null)
    setIsSubmitting(false)
  }, [open, initialStars, bookingId])

  const shownOverall = overallHover ?? overall
  const overallTone = shownOverall ? REVIEW_TONE_BY_RATING[shownOverall] : "Tap a star rating above"
  const canSubmit = overall > 0 && !isSubmitting
  const commentTrimmed = comment.trim()
  const showSoftWarning = commentTrimmed.length > 0 && commentTrimmed.length < 20

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          listingId,
          ratingOverall: overall,
          ratings: {},
          comment: commentTrimmed || null,
          recommend: null,
          photoUrls: [],
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
      onOpenChange(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to post review")
      setIsSubmitting(false)
    }
  }

  const safeTitle = listingTitle.trim() || "this session"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(90vh,640px)] max-w-[calc(100%-1.5rem)] gap-0 overflow-y-auto rounded-2xl border-[#E6DDD3] bg-[#FBF8F4] p-0 sm:max-w-md"
        showCloseButton
      >
        <DialogHeader className="border-b border-[#EFE7DE] px-5 py-4 text-left">
          <DialogTitle className="font-serif text-xl text-[#1A1410]">How was it?</DialogTitle>
          <DialogDescription className="text-left text-sm text-[#7A6A5D]">
            Rate <span className="font-medium text-[#5E4E42]">{safeTitle}</span>. Add an optional note below, then submit.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
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
            <label htmlFor={`review-comment-${bookingId}`} className="text-sm font-medium text-[#1A1410]">
              Comment <span className="font-normal text-[#9D8D80]">(optional)</span>
            </label>
            <Textarea
              id={`review-comment-${bookingId}`}
              value={comment}
              maxLength={1000}
              placeholder="Anything others should know? (optional)"
              className="min-h-[100px] resize-y rounded-xl border-[#E2D8CC] bg-white text-sm text-[#2C231D]"
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex items-center justify-between gap-2">
              {showSoftWarning ? (
                <p className="text-xs text-amber-700">Helpful reviews often have a bit more detail (20+ characters).</p>
              ) : (
                <span className="text-xs text-[#9D8D80]" />
              )}
              {comment.length > 0 ? (
                <p className={`shrink-0 text-xs ${comment.length >= 1000 ? "text-rose-700" : "text-[#9D8D80]"}`}>
                  {comment.length}/1000
                </p>
              ) : null}
            </div>
          </div>

          {errorMessage ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
          ) : null}

          <p className="text-xs text-[#8A796B]">
            For photos, detailed category ratings, and more, use{" "}
            <Link
              href={`/review/${bookingId}?from=dashboard${overall > 0 ? `&initial_rating=${overall}` : ""}`}
              className="font-medium text-[#6A5A4D] underline underline-offset-2"
              onClick={() => onOpenChange(false)}
            >
              the full review form
            </Link>
            .
          </p>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
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
                "Submit review"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
