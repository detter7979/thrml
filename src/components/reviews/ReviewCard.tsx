"use client"

import { useMemo, useState } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { isLikelyValidAvatarUrl } from "@/lib/avatar-url"

type ReviewItem = {
  id: string
  rating_overall: number
  rating_cleanliness?: number | null
  rating_accuracy?: number | null
  rating_communication?: number | null
  rating_value?: number | null
  comment?: string | null
  photo_urls?: string[]
  host_response?: string | null
  host_responded_at?: string | null
  created_at?: string | null
  profile?: { full_name?: string | null; avatar_url?: string | null } | null
  host_name?: string | null
}

type ReviewCardProps = {
  review: ReviewItem
  isHostView?: boolean
  onResponded?: (reviewId: string, response: string) => void
  highlightPending?: boolean
}

function initials(name: string) {
  const parts = name.trim().split(" ").filter(Boolean)
  if (!parts.length) return ""
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase()
}

function initialsForReview(fullName: string | null | undefined) {
  const raw = (fullName ?? "").trim()
  return raw ? initials(raw) : ""
}

function displayName(fullName: string | null | undefined) {
  const normalized = (fullName ?? "").trim()
  if (!normalized) return "Guest"
  const parts = normalized.split(" ").filter(Boolean)
  const first = parts[0] ?? "Guest"
  const lastInitial = parts.length > 1 ? `${parts[parts.length - 1].slice(0, 1).toUpperCase()}.` : ""
  return `${first} ${lastInitial}`.trim()
}

function relativeDate(value: string | null | undefined) {
  if (!value) return "recently"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "recently"
  const diffMs = Date.now() - date.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days < 1) return "today"
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`
  }
  if (days < 365) {
    const months = Math.floor(days / 30)
    return `${months} month${months === 1 ? "" : "s"} ago`
  }
  const years = Math.floor(days / 365)
  return `${years} year${years === 1 ? "" : "s"} ago`
}

function starRow(value: number) {
  const full = Math.max(0, Math.min(5, Math.round(value)))
  return "★★★★★".slice(0, full).padEnd(5, "☆")
}

export function ReviewCard({ review, isHostView = false, onResponded, highlightPending = false }: ReviewCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [replyOpen, setReplyOpen] = useState(false)
  const [reply, setReply] = useState("")
  const [savingReply, setSavingReply] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [localHostResponse, setLocalHostResponse] = useState(review.host_response ?? null)
  const [localRespondedAt, setLocalRespondedAt] = useState(review.host_responded_at ?? null)

  const avatarUrlRaw = (review.profile?.avatar_url ?? "").trim()
  const avatarUrlSafe = isLikelyValidAvatarUrl(avatarUrlRaw) ? avatarUrlRaw : ""

  const hasAllSubRatings = useMemo(() => {
    const values = [
      review.rating_cleanliness,
      review.rating_accuracy,
      review.rating_communication,
      review.rating_value,
    ]
    return values.every((value) => Number(value ?? 0) >= 1)
  }, [review])

  const longComment = (review.comment ?? "").length > 200
  const shownComment = expanded || !longComment ? review.comment ?? "" : `${(review.comment ?? "").slice(0, 200)}...`
  const guestName = displayName(review.profile?.full_name ?? null)
  const avatarInitials = initialsForReview(review.profile?.full_name ?? null)
  const hostFirstName = (review.host_name ?? "Host").split(" ")[0] ?? "Host"

  async function postResponse() {
    if (!reply.trim() || savingReply) return
    setSavingReply(true)
    setReplyError(null)
    try {
      const response = await fetch(`/api/reviews/${review.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: reply.trim() }),
      })
      const payload = (await response.json()) as { error?: string; review?: { host_response?: string; host_responded_at?: string } }
      if (!response.ok) throw new Error(payload.error ?? "Failed to post response")
      const responseText = payload.review?.host_response ?? reply.trim()
      const respondedAt = payload.review?.host_responded_at ?? new Date().toISOString()
      setLocalHostResponse(responseText)
      setLocalRespondedAt(respondedAt)
      setReply("")
      setReplyOpen(false)
      onResponded?.(review.id, responseText)
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : "Failed to post response")
    } finally {
      setSavingReply(false)
    }
  }

  return (
    <article
      className={`py-5 ${highlightPending && !localHostResponse ? "border-l-2 border-amber-300 pl-3" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8 shrink-0">
            {avatarUrlSafe ? (
              <AvatarImage key={avatarUrlSafe} src={avatarUrlSafe} alt="" className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-[#D4CAC2] text-[11px] font-semibold tracking-tight text-[#5C514A]">
              {avatarInitials || "\u00A0"}
            </AvatarFallback>
          </Avatar>
          <p className="text-sm font-medium text-[#1A1410]">{guestName}</p>
        </div>
        <p className="text-xs text-[#8A7A6D]">{relativeDate(review.created_at)}</p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[14px] text-[#F5A76C]">{starRow(review.rating_overall)}</span>
        {hasAllSubRatings ? (
          <div className="flex flex-wrap gap-1">
            <span className="rounded-full bg-[#F4EEE7] px-2 py-0.5 text-[11px] text-[#7A6B5D]">
              Cleanliness ★{review.rating_cleanliness}
            </span>
            <span className="rounded-full bg-[#F4EEE7] px-2 py-0.5 text-[11px] text-[#7A6B5D]">
              Accuracy ★{review.rating_accuracy}
            </span>
            <span className="rounded-full bg-[#F4EEE7] px-2 py-0.5 text-[11px] text-[#7A6B5D]">
              Communication ★{review.rating_communication}
            </span>
            <span className="rounded-full bg-[#F4EEE7] px-2 py-0.5 text-[11px] text-[#7A6B5D]">
              Value ★{review.rating_value}
            </span>
          </div>
        ) : null}
      </div>

      <p className="mt-2 text-sm leading-[1.65] text-[#2F2620]">{shownComment || "Great session."}</p>
      {longComment ? (
        <button type="button" onClick={() => setExpanded((current) => !current)} className="mt-1 text-xs text-[#6B5B4F] underline">
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}

      {review.photo_urls?.length ? (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {review.photo_urls.slice(0, 6).map((url, index) => (
            <button
              type="button"
              key={url}
              aria-label={`View review photo ${index + 1}`}
              onClick={() => setLightboxUrl(url)}
            >
              <img src={url} alt="Review photo" className="h-[60px] w-[60px] rounded-lg object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      {lightboxUrl ? (
        <button
          type="button"
          aria-label="Close enlarged photo"
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        >
          <img src={lightboxUrl} alt="Review photo large" className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" />
        </button>
      ) : null}

      {localHostResponse ? (
        <div className="mt-3 rounded-xl bg-[#FAF5EE] px-3 py-2.5">
          <p className="text-[13px] italic text-[#8A7769]">Response from {hostFirstName}</p>
          <p className="mt-1 text-sm text-[#3E3128]">{localHostResponse}</p>
          <p className="mt-1 text-[11px] text-[#9A8A7D]">{relativeDate(localRespondedAt)}</p>
        </div>
      ) : null}

      {isHostView && !localHostResponse ? (
        <div className="mt-3">
          <button type="button" onClick={() => setReplyOpen((current) => !current)} className="text-sm text-[#6A5A4D] underline">
            Reply to this review
          </button>
          {replyOpen ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={reply}
                onChange={(event) => setReply(event.target.value.slice(0, 500))}
                placeholder="Write a thoughtful response..."
                aria-label="Write a response to this review"
                className="min-h-[90px] w-full rounded-xl border border-[#E5D9CC] bg-white p-3 text-sm outline-none"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#8B7B6F]">{reply.length}/500</p>
                <button
                  type="button"
                  onClick={() => void postResponse()}
                  disabled={!reply.trim() || savingReply}
                  className="rounded-lg bg-[#1A1410] px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  {savingReply ? "Posting..." : "Post response"}
                </button>
              </div>
              {replyError ? <p className="text-xs text-rose-700">{replyError}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
