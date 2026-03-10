"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react"

import { CancelModal } from "@/components/booking/CancelModal"
import { RatingSummary } from "@/components/reviews/RatingSummary"
import { ReviewCard } from "@/components/reviews/ReviewCard"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { formatMoney, type ListingCancellationPolicy } from "@/lib/cancellations"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type ListingRow = {
  id: string
  title: string
  service_type: string
  access_type: string | null
  access_code_template?: string | null
  access_code_type: string | null
  is_active: boolean
  price_from: number
  cancellation_policy: ListingCancellationPolicy
  active_booking_count: number
  upcoming_bookings: Array<{
    id: string
    session_date: string | null
    start_time: string | null
    end_time: string | null
    duration_hours: number | null
    guest_count: number | null
    confirmation_deadline: string | null
    status: string
    access_code: string | null
    access_code_sent_at: string | null
    guest_name: string | null
    guest_avatar_url?: string | null
    service_fee: number | null
    total_charged: number | null
    host_payout: number | null
    waiver_accepted: boolean
    waiver_accepted_at: string | null
  }>
  reviews: Array<{
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
  }>
  rating_summary?: {
    avg_overall: number
    review_count: number
    avg_cleanliness: number
    avg_accuracy: number
    avg_communication: number
    avg_value: number
  }
}

type HostCancellationRecord = {
  id: string
  booking_id: string
  listing_id: string
  cancelled_at: string
  hours_before_session: number
  penalty_amount: number
  policy_applied: string
}

function sessionLabel(sessionDate: string | null, startTime: string | null, endTime: string | null) {
  if (!sessionDate) return "Date TBD"
  const date = new Date(`${sessionDate}T12:00:00`)
  if (Number.isNaN(date.getTime())) return "Date TBD"
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date)
  const start = startTime
    ? new Date(`${sessionDate}T${startTime}`).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "TBD"
  const end = endTime
    ? new Date(`${sessionDate}T${endTime}`).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "TBD"
  return `${dateLabel} · ${start}–${end}`
}

function isCodeAccessType(value: string | null | undefined) {
  const key = (value ?? "").trim().toLowerCase()
  return key === "code" || key === "lockbox" || key === "smart_lock"
}

function relativeTime(value: string | null) {
  if (!value) return "Not sent yet"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Not sent yet"
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)))
  if (diffMins < 60) return `Last sent ${diffMins} minute${diffMins === 1 ? "" : "s"} ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `Last sent ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
  const diffDays = Math.floor(diffHours / 24)
  return `Last sent ${diffDays} day${diffDays === 1 ? "" : "s"} ago`
}

function formatWaiverAcceptedAt(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}

export function DashboardListingsClient({
  pendingRequests,
  listings,
  hostCancellations,
  cancellationCountLast90Days,
}: {
  pendingRequests: Array<{
    id: string
    listing_id: string
    listing_title: string
    session_date: string | null
    start_time: string | null
    end_time: string | null
    duration_hours: number | null
    guest_count: number | null
    host_payout: number | null
    confirmation_deadline: string | null
    guest_name: string | null
    guest_avatar_url: string | null
  }>
  listings: ListingRow[]
  hostCancellations: HostCancellationRecord[]
  cancellationCountLast90Days: number
}) {
  const router = useRouter()
  const [expandedListingId, setExpandedListingId] = useState<string | null>(null)
  const [activeTabs, setActiveTabs] = useState<Record<string, "upcoming" | "recent" | "reviews">>({})
  const [copiedBookingId, setCopiedBookingId] = useState<string | null>(null)
  const [confirmingRequest, setConfirmingRequest] = useState<string | null>(null)
  const [decliningRequest, setDecliningRequest] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState<string>("")
  const [requestActionLoading, setRequestActionLoading] = useState<string | null>(null)
  const [requestActionError, setRequestActionError] = useState<string | null>(null)
  const [dismissedRequestIds, setDismissedRequestIds] = useState<string[]>([])
  const [attentionCodeByBooking, setAttentionCodeByBooking] = useState<Record<string, string>>({})
  const [attentionSendingId, setAttentionSendingId] = useState<string | null>(null)
  const [dismissedAttentionIds, setDismissedAttentionIds] = useState<string[]>([])
  const [attentionSentIds, setAttentionSentIds] = useState<string[]>([])
  const [showCodeByBooking, setShowCodeByBooking] = useState<Record<string, boolean>>({})
  const [codeByBooking, setCodeByBooking] = useState<Record<string, string>>({})
  const [savedCodeByBooking, setSavedCodeByBooking] = useState<Record<string, string>>({})
  const [saveStateByBooking, setSaveStateByBooking] = useState<
    Record<string, "idle" | "saving" | "saved" | "error">
  >({})
  const [saveErrorByBooking, setSaveErrorByBooking] = useState<Record<string, string | null>>({})
  const [sendingByBookingId, setSendingByBookingId] = useState<string | null>(null)
  const [resentConfirmationByBooking, setResentConfirmationByBooking] = useState<Record<string, string>>({})
  const [expandedAccessByBooking, setExpandedAccessByBooking] = useState<Record<string, boolean>>({})
  const [listingActionLoadingId, setListingActionLoadingId] = useState<string | null>(null)
  const [listingActionErrorById, setListingActionErrorById] = useState<Record<string, string | null>>({})

  const visiblePendingRequests = useMemo(
    () => pendingRequests.filter((request) => !dismissedRequestIds.includes(request.id)),
    [dismissedRequestIds, pendingRequests]
  )
  const selectedConfirmRequest = visiblePendingRequests.find((request) => request.id === confirmingRequest) ?? null
  const selectedDeclineRequest = visiblePendingRequests.find((request) => request.id === decliningRequest) ?? null

  useEffect(() => {
    const nextCodes: Record<string, string> = {}
    for (const listing of listings) {
      for (const booking of listing.upcoming_bookings) {
        const fallbackCode = (booking.access_code ?? listing.access_code_template ?? "").slice(0, 20)
        nextCodes[booking.id] = fallbackCode
      }
    }
    setCodeByBooking(nextCodes)
    setSavedCodeByBooking(nextCodes)
  }, [listings])

  async function cancelBooking(bookingId: string, reason?: string) {
    await fetch(`/api/bookings/${bookingId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancelled_by: "host", reason }),
    })
    router.refresh()
  }

  async function copyAccessCode(bookingId: string, accessCode: string) {
    try {
      await navigator.clipboard.writeText(accessCode)
      setCopiedBookingId(bookingId)
      window.setTimeout(() => {
        setCopiedBookingId((current) => (current === bookingId ? null : current))
      }, 1600)
    } catch {
      setCopiedBookingId(null)
    }
  }

  async function confirmPendingRequest(bookingId: string) {
    setRequestActionLoading(bookingId)
    setRequestActionError(null)
    try {
      const response = await fetch(`/api/bookings/${bookingId}/confirm`, { method: "PATCH" })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        setRequestActionError(payload.error ?? "Unable to confirm this booking right now.")
        return
      }
      setDismissedRequestIds((current) => [...current, bookingId])
      setConfirmingRequest(null)
      router.refresh()
    } finally {
      setRequestActionLoading(null)
    }
  }

  async function declinePendingRequest(bookingId: string, reason: string | null) {
    setRequestActionLoading(bookingId)
    try {
      const response = await fetch(`/api/bookings/${bookingId}/decline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      if (!response.ok) return
      setDismissedRequestIds((current) => [...current, bookingId])
      setDecliningRequest(null)
      setDeclineReason("")
      router.refresh()
    } finally {
      setRequestActionLoading(null)
    }
  }

  const needsAttention = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return listings
      .flatMap((listing) =>
        listing.upcoming_bookings
          .filter(
            (booking) =>
              listing.access_code_type === "dynamic" &&
              booking.status === "confirmed" &&
              !booking.access_code &&
              Boolean(booking.session_date) &&
              (booking.session_date ?? "") >= today &&
              !dismissedAttentionIds.includes(booking.id)
          )
          .map((booking) => ({
            bookingId: booking.id,
            sessionDate: booking.session_date,
            guestName: booking.guest_name ?? "Guest",
          }))
      )
      .sort((a, b) => (a.sessionDate ?? "").localeCompare(b.sessionDate ?? ""))
  }, [dismissedAttentionIds, listings])

  async function submitAccessCode(bookingId: string, code: string) {
    setAttentionSendingId(bookingId)
    try {
      const response = await fetch(`/api/bookings/${bookingId}/access-code`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, send: true }),
      })
      if (!response.ok) return false
      setAttentionSentIds((current) => [...current, bookingId])
      window.setTimeout(() => {
        setDismissedAttentionIds((current) => [...current, bookingId])
      }, 900)
      setCodeByBooking((current) => ({ ...current, [bookingId]: code }))
      setSavedCodeByBooking((current) => ({ ...current, [bookingId]: code }))
      router.refresh()
      return true
    } finally {
      setAttentionSendingId(null)
    }
  }

  async function saveAccessCodeForBooking(bookingId: string) {
    const code = (codeByBooking[bookingId] ?? "").trim().slice(0, 20)
    if (!code) return
    if (code === (savedCodeByBooking[bookingId] ?? "").trim()) return
    setSaveStateByBooking((current) => ({ ...current, [bookingId]: "saving" }))
    setSaveErrorByBooking((current) => ({ ...current, [bookingId]: null }))
    try {
      const response = await fetch(`/api/bookings/${bookingId}/access-code`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, send: false }),
      })
      const payload = (await response.json()) as { access_code?: string; error?: string }
      if (!response.ok) {
        setSaveStateByBooking((current) => ({ ...current, [bookingId]: "error" }))
        setSaveErrorByBooking((current) => ({
          ...current,
          [bookingId]: payload.error ?? "Save failed. Please try again.",
        }))
        return
      }
      if ((payload.access_code ?? code) !== code) {
        setSaveStateByBooking((current) => ({ ...current, [bookingId]: "error" }))
        setSaveErrorByBooking((current) => ({
          ...current,
          [bookingId]: "Saved value mismatch. Please retry.",
        }))
        return
      }
      setCodeByBooking((current) => ({ ...current, [bookingId]: code }))
      setSavedCodeByBooking((current) => ({ ...current, [bookingId]: code }))
      setSaveStateByBooking((current) => ({ ...current, [bookingId]: "saved" }))
      window.setTimeout(() => {
        setSaveStateByBooking((current) => ({
          ...current,
          [bookingId]: current[bookingId] === "saved" ? "idle" : current[bookingId],
        }))
      }, 2000)
      router.refresh()
    } finally {
      // no-op
    }
  }

  async function sendAccessCodeToGuest(bookingId: string) {
    const code = (codeByBooking[bookingId] ?? "").trim().slice(0, 20)
    if (!code) return
    setSendingByBookingId(bookingId)
    try {
      const response = await fetch(`/api/bookings/${bookingId}/access-code`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, send: true }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        setSaveStateByBooking((current) => ({ ...current, [bookingId]: "error" }))
        setSaveErrorByBooking((current) => ({
          ...current,
          [bookingId]: payload.error ?? "Unable to send access details.",
        }))
        return
      }
      const guestName =
        listings
          .flatMap((listing) => listing.upcoming_bookings)
          .find((booking) => booking.id === bookingId)
          ?.guest_name ?? "guest"
      const firstName = guestName.split(" ")[0] ?? "guest"
      setResentConfirmationByBooking((current) => ({
        ...current,
        [bookingId]: `Access details resent to ${firstName} ✓`,
      }))
      window.setTimeout(() => {
        setResentConfirmationByBooking((current) => {
          const next = { ...current }
          delete next[bookingId]
          return next
        })
      }, 2500)
      router.refresh()
    } finally {
      setSendingByBookingId(null)
    }
  }

  async function setListingActiveState(listingId: string, shouldActivate: boolean) {
    const endpoint = shouldActivate ? "reactivate" : "deactivate"
    setListingActionLoadingId(listingId)
    setListingActionErrorById((current) => ({ ...current, [listingId]: null }))
    try {
      const response = await fetch(`/api/listings/${listingId}/${endpoint}`, { method: "PATCH" })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setListingActionErrorById((current) => ({
          ...current,
          [listingId]:
            payload.error ??
            (shouldActivate ? "Unable to reactivate listing right now." : "Unable to deactivate listing right now."),
        }))
        return
      }
      router.refresh()
    } finally {
      setListingActionLoadingId((current) => (current === listingId ? null : current))
    }
  }

  function hoursRemaining(deadline: string | null) {
    if (!deadline) return null
    const diffMs = new Date(deadline).getTime() - Date.now()
    if (!Number.isFinite(diffMs)) return null
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)))
  }

  function remainingTone(hours: number | null) {
    if (hours === null) return "text-[#6D5E51]"
    if (hours <= 2) return "text-rose-700"
    if (hours <= 6) return "text-amber-700"
    return "text-[#6D5E51]"
  }

  return (
    <div className="space-y-4">
      {visiblePendingRequests.length ? (
        <section className="rounded-2xl border border-[#E9DFD3] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-serif text-2xl text-[#1A1410]">Booking requests</h2>
            <span className="rounded-full bg-[#C75B3A] px-2 py-0.5 text-xs text-white">
              {visiblePendingRequests.length}
            </span>
          </div>
          <div className="space-y-3">
            {visiblePendingRequests.map((request) => {
              const hoursLeft = hoursRemaining(request.confirmation_deadline)
              const tone = remainingTone(hoursLeft)
              const requestTime = sessionLabel(request.session_date, request.start_time, request.end_time)
              const guestInitials = (request.guest_name ?? "Guest")
                .split(" ")
                .filter(Boolean)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()
              return (
                <article key={request.id} className="rounded-xl border border-[#E9DFD3] bg-[#FCFAF7] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Avatar size="sm">
                          <AvatarImage src={request.guest_avatar_url ?? undefined} alt={request.guest_name ?? "Guest"} />
                          <AvatarFallback>{guestInitials || "G"}</AvatarFallback>
                        </Avatar>
                        <p className="text-sm font-medium text-[#1A1410]">{request.guest_name ?? "Guest"}</p>
                      </div>
                      <p className="text-sm font-medium text-[#1A1410]">{request.listing_title}</p>
                      <p className="text-xs text-[#6D5E51]">
                        {requestTime} · {Number(request.duration_hours ?? 1)}h · {Number(request.guest_count ?? 1)} guests
                      </p>
                      <p className="text-xs text-[#6D5E51]">You&apos;d receive {formatMoney(Number(request.host_payout ?? 0))}</p>
                      <p className={`text-xs font-medium ${tone}`}>
                        {hoursLeft === null ? "Respond soon" : `Respond within ${hoursLeft} hr${hoursLeft === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="bg-[#C75B3A] text-white hover:bg-[#b44f31]"
                        onClick={() => {
                          setRequestActionError(null)
                          setConfirmingRequest(request.id)
                        }}
                        disabled={requestActionLoading === request.id}
                      >
                        Confirm booking
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setDecliningRequest(request.id)}
                        disabled={requestActionLoading === request.id}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {needsAttention.length ? (
        <section className="rounded-2xl border border-[#F1D4BA] bg-[#FFF7F0] p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-serif text-2xl text-[#1A1410]">Needs attention</h2>
            <span className="rounded-full bg-[#C75B3A] px-2 py-0.5 text-xs text-white">{needsAttention.length}</span>
          </div>
          <div className="space-y-2">
            {needsAttention.map((item) => {
              const guestFirstName = item.guestName.split(" ")[0] ?? "Guest"
              const dateLabel = item.sessionDate
                ? new Date(`${item.sessionDate}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : "upcoming date"
              const inputValue = attentionCodeByBooking[item.bookingId] ?? ""
              return (
                <div key={item.bookingId} className="rounded-lg border border-[#E9DFD3] bg-white p-3">
                  <p className="text-sm text-[#1A1410]">
                    ⚠ Set access code for {guestFirstName}&apos;s session on {dateLabel}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      value={inputValue}
                      maxLength={20}
                      onChange={(event) =>
                        setAttentionCodeByBooking((current) => ({
                          ...current,
                          [item.bookingId]: event.target.value.slice(0, 20),
                        }))
                      }
                      placeholder="Enter code"
                      className="h-9 min-w-[180px] rounded-md border border-[#E5DDD6] px-3 text-sm"
                    />
                    <Button
                      size="sm"
                      disabled={!inputValue.trim() || attentionSendingId === item.bookingId}
                      onClick={() => void submitAccessCode(item.bookingId, inputValue.trim())}
                    >
                      {attentionSendingId === item.bookingId ? "Sending..." : "Send to guest"}
                    </Button>
                    {attentionSentIds.includes(item.bookingId) ? (
                      <p className="text-xs text-emerald-700">Code sent to {guestFirstName} ✓</p>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      <div className="space-y-3">
        {listings.map((listing) => {
          const isExpanded = expandedListingId === listing.id
          const activeTab = activeTabs[listing.id] ?? "upcoming"
          const openListing = () => router.push(`/listing/${listing.id}`)
          const orderedReviews = [...listing.reviews].sort((a, b) => {
            const aPending = !a.host_response
            const bPending = !b.host_response
            if (aPending !== bPending) return aPending ? -1 : 1
            return new Date(b.created_at ?? "").getTime() - new Date(a.created_at ?? "").getTime()
          })
          const starDistribution = orderedReviews.reduce(
            (acc, review) => {
              const stars = Math.max(1, Math.min(5, Math.round(Number(review.rating_overall ?? 0))))
              acc[stars] += 1
              return acc
            },
            { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>
          )
          return (
            <article
              key={listing.id}
              className="group w-full overflow-hidden rounded-2xl bg-white p-5 shadow-sm"
            >
              <div
                role="button"
                tabIndex={0}
                onClick={openListing}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    openListing()
                  }
                }}
                className="flex cursor-pointer flex-wrap items-center justify-between gap-3"
              >
                <div className="text-left">
                  <p className="font-serif text-xl text-[#1A1410]">{listing.title}</p>
                  <p className="text-xs text-[#7A6A5D]">
                    {listing.service_type} · {listing.is_active ? "Live" : "Draft"} ·{" "}
                    {listing.active_booking_count} active booking
                    {listing.active_booking_count === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium text-[#C75B3A]">
                    From ${Number(listing.price_from ?? 0).toFixed(0)}
                  </p>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      const shouldActivate = !listing.is_active
                      if (!shouldActivate) {
                        const confirmed = window.confirm(
                          "Deactivate this listing? It will no longer appear to new guests."
                        )
                        if (!confirmed) return
                      }
                      void setListingActiveState(listing.id, shouldActivate)
                    }}
                    disabled={listingActionLoadingId === listing.id}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs transition-all md:opacity-0 md:pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto md:group-focus-within:opacity-100 md:group-focus-within:pointer-events-auto ${
                      listing.is_active
                        ? "border-rose-100 text-rose-500 hover:bg-rose-50"
                        : "border-emerald-100 text-emerald-600 hover:bg-emerald-50"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {listingActionLoadingId === listing.id
                      ? listing.is_active
                        ? "Deactivating..."
                        : "Reactivating..."
                      : listing.is_active
                        ? "Deactivate"
                        : "Reactivate"}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setExpandedListingId((current) => (current === listing.id ? null : listing.id))
                    }}
                    className="rounded-lg border border-[#E6DDD3] px-3 py-2 text-sm text-[#5D4E43]"
                  >
                    {isExpanded ? "Hide details" : "Manage"}
                  </button>
                  <Link
                    href={`/dashboard/listings/${listing.id}/edit`}
                    onClick={(event) => event.stopPropagation()}
                    className="rounded-lg border border-[#E6DDD3] px-3 py-2 text-sm text-[#5D4E43]"
                  >
                    Edit
                  </Link>
                </div>
              </div>
              {listingActionErrorById[listing.id] ? (
                <p className="mt-2 text-sm text-rose-700">{listingActionErrorById[listing.id]}</p>
              ) : null}

              {isExpanded ? (
                <div
                  className="mt-4 grid w-full cursor-default gap-5 overflow-hidden rounded-xl border border-[#ECE2D6] bg-[#FBF8F4] p-5 md:grid-cols-2"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-wide text-[#8A7B6D]">Cancellation settings</p>
                      <p className="leading-relaxed text-sm text-[#1A1410]">
                        <span className="inline-flex rounded-full border border-[#E9DFD3] bg-white px-2.5 py-1 text-xs text-[#5D4E43]">
                          Cancellation: {listing.cancellation_policy}
                        </span>
                      </p>
                      {listing.active_booking_count === 0 ? (
                        <Link
                          href={`/dashboard/listings/${listing.id}/edit`}
                          className="mt-2 inline-block text-sm text-[#C75B3A] underline-offset-2 hover:underline"
                        >
                          Change policy →
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex gap-2 text-xs">
                      {[
                        { key: "upcoming", label: `Upcoming (${listing.upcoming_bookings.length})` },
                        { key: "recent", label: "Recent Bookings" },
                        { key: "reviews", label: `Reviews (${listing.reviews.length})` },
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() =>
                            setActiveTabs((current) => ({
                              ...current,
                              [listing.id]: tab.key as "upcoming" | "recent" | "reviews",
                            }))
                          }
                          className={`rounded-full px-2.5 py-1 ${
                            activeTab === tab.key ? "bg-[#1A1410] text-white" : "bg-white text-[#6A5A4D]"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {activeTab === "upcoming" ? (
                      listing.upcoming_bookings.length === 0 ? (
                        <p className="text-sm text-[#7A6A5D]">No upcoming bookings for this listing.</p>
                      ) : (
                        listing.upcoming_bookings.map((booking) => {
                          const showAccessCode =
                            booking.status === "confirmed" && isCodeAccessType(listing.access_type)
                          return (
                            <div key={booking.id} className="max-w-full overflow-hidden rounded-lg border border-[#E9DFD3] bg-white p-3 box-border">
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className={`min-w-0 max-w-full flex-1 ${showAccessCode ? "flex min-h-[74px] flex-col justify-between" : ""}`}>
                                  <div>
                                    <p className="text-sm font-medium text-[#1A1410]">{booking.guest_name ?? "Guest"}</p>
                                    <p className="text-xs leading-relaxed text-[#6D5E51]">
                                      {sessionLabel(booking.session_date, booking.start_time, booking.end_time)}
                                    </p>
                                    <div className="mt-1">
                                      {booking.waiver_accepted ? (
                                        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700">
                                          Waiver signed
                                          {formatWaiverAcceptedAt(booking.waiver_accepted_at)
                                            ? ` • ${formatWaiverAcceptedAt(booking.waiver_accepted_at)}`
                                            : ""}
                                        </span>
                                      ) : (
                                        <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
                                          Waiver pending
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className={showAccessCode ? "" : "mt-2"}>
                                    <CancelModal
                                      booking={{
                                        id: booking.id,
                                        session_date: booking.session_date,
                                        start_time: booking.start_time,
                                        end_time: booking.end_time,
                                        listing_title: listing.title,
                                        service_fee: booking.service_fee,
                                      }}
                                      userRole="host"
                                      onConfirm={({ reason }) => cancelBooking(booking.id, reason)}
                                    />
                                  </div>
                                </div>
                                {showAccessCode ? (
                                  <div className="w-full max-w-full shrink-0 rounded-lg border border-[#F1D4BA] bg-[#FFF4E8] p-3 box-border md:max-w-[320px]">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedAccessByBooking((current) => ({
                                          ...current,
                                          [booking.id]: !current[booking.id],
                                        }))
                                      }
                                      className="flex w-full items-center justify-between gap-2 text-left"
                                    >
                                      <p className="text-sm font-medium text-[#1A1410]">🔐 Access details</p>
                                      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#8C5336]">
                                        Edit
                                        {expandedAccessByBooking[booking.id] ? (
                                          <ChevronUp className="size-3.5" />
                                        ) : (
                                          <ChevronDown className="size-3.5" />
                                        )}
                                      </span>
                                    </button>
                                    {expandedAccessByBooking[booking.id] ? (
                                      <div className="mt-3 space-y-2 border-t border-[#E8BE9A] pt-3">
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-xs text-[#6A5848]">Current code</p>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setShowCodeByBooking((current) => ({
                                                ...current,
                                                [booking.id]: !current[booking.id],
                                              }))
                                            }
                                            className="text-xs text-[#8C5336] underline"
                                          >
                                            {showCodeByBooking[booking.id] ? "Hide" : "Reveal"}
                                          </button>
                                        </div>
                                        <div className="flex items-center justify-between gap-2 rounded-md bg-[#FFF9F3] p-2">
                                          <p className="font-mono text-sm tracking-[0.2em] text-[#C75B3A]">
                                            {showCodeByBooking[booking.id]
                                              ? codeByBooking[booking.id] ?? booking.access_code ?? "Pending"
                                              : "••••"}
                                          </p>
                                          {booking.access_code ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                booking.access_code
                                                  ? void copyAccessCode(booking.id, booking.access_code)
                                                  : undefined
                                              }
                                              className="inline-flex items-center gap-1 rounded-md border border-[#E8BE9A] bg-white px-2 py-1 text-xs text-[#C75B3A]"
                                            >
                                              {copiedBookingId === booking.id ? (
                                                <>
                                                  <Check className="size-3.5" />
                                                  Copied
                                                </>
                                              ) : (
                                                <>
                                                  <Copy className="size-3.5" />
                                                  Copy
                                                </>
                                              )}
                                            </button>
                                          ) : null}
                                        </div>
                                        <p className="text-xs leading-relaxed text-[#6A5848]">
                                          Access code for this booking only. {relativeTime(booking.access_code_sent_at)}
                                        </p>
                                        {resentConfirmationByBooking[booking.id] ? (
                                          <p className="text-xs text-emerald-700">{resentConfirmationByBooking[booking.id]}</p>
                                        ) : null}
                                        <input
                                          value={codeByBooking[booking.id] ?? booking.access_code ?? ""}
                                          maxLength={20}
                                          onChange={(event) =>
                                            setCodeByBooking((current) => ({
                                              ...current,
                                              [booking.id]: event.target.value.slice(0, 20),
                                            }))
                                          }
                                          placeholder="Update code input field"
                                          className="h-8 w-full min-w-0 rounded-md border border-[#E5DDD6] px-2 text-xs font-mono"
                                        />
                                        <div className="flex flex-wrap gap-2">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8"
                                            disabled={
                                              (codeByBooking[booking.id] ?? "").trim() ===
                                                (savedCodeByBooking[booking.id] ?? "").trim() ||
                                              saveStateByBooking[booking.id] === "saving"
                                            }
                                            onClick={() => void saveAccessCodeForBooking(booking.id)}
                                          >
                                            {saveStateByBooking[booking.id] === "saving" ? "Saving..." : "Save code"}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8"
                                            disabled={sendingByBookingId === booking.id || !(codeByBooking[booking.id] ?? "").trim()}
                                            onClick={() => void sendAccessCodeToGuest(booking.id)}
                                          >
                                            {sendingByBookingId === booking.id ? "Sending..." : "Send to guest"}
                                          </Button>
                                        </div>
                                        {saveStateByBooking[booking.id] === "saved" ? (
                                          <p className="text-xs text-emerald-700">✓ Saved</p>
                                        ) : null}
                                        {saveStateByBooking[booking.id] === "error" ? (
                                          <p className="text-xs text-rose-700">
                                            {saveErrorByBooking[booking.id] ?? "Save failed. Please try again."}
                                          </p>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          )
                        })
                      )
                    ) : null}

                    {activeTab === "recent" ? (
                      <p className="text-sm text-[#7A6A5D]">Recent booking history is coming soon.</p>
                    ) : null}

                    {activeTab === "reviews" ? (
                      <div className="space-y-3">
                        <RatingSummary
                          compact
                          avgOverall={Number(listing.rating_summary?.avg_overall ?? 0)}
                          reviewCount={Number(listing.rating_summary?.review_count ?? listing.reviews.length)}
                          averages={{
                            cleanliness: Number(listing.rating_summary?.avg_cleanliness ?? 0),
                            accuracy: Number(listing.rating_summary?.avg_accuracy ?? 0),
                            communication: Number(listing.rating_summary?.avg_communication ?? 0),
                            value: Number(listing.rating_summary?.avg_value ?? 0),
                          }}
                          starDistribution={starDistribution}
                        />
                        <div className="space-y-1 divide-y divide-[#ECE2D6] rounded-xl border border-[#ECE2D6] bg-white px-3">
                          {orderedReviews.length ? (
                            orderedReviews.map((review) => (
                              <ReviewCard
                                key={review.id}
                                review={review}
                                isHostView
                                highlightPending
                                onResponded={() => router.refresh()}
                              />
                            ))
                          ) : (
                            <p className="py-5 text-sm text-[#7A6A5D]">No reviews yet.</p>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>

      {hostCancellations.length ? (
        <details className="rounded-2xl bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium text-[#5C4D40]">
            Cancellation history ({hostCancellations.length}) · {cancellationCountLast90Days} in last 90 days
          </summary>
          <div className="mt-3 space-y-2">
            {hostCancellations.map((record) => (
              <div key={record.id} className="rounded-xl border border-[#E9DFD3] bg-[#FCFAF7] px-3 py-2 text-sm">
                <p className="text-[#1A1410]">
                  {new Date(record.cancelled_at).toLocaleDateString()} · Booking {record.booking_id.slice(0, 8)} ·{" "}
                  {record.hours_before_session.toFixed(1)}h before
                </p>
                <p className="text-[#7A6A5D]">
                  Penalty applied: {formatMoney(record.penalty_amount)} ({record.policy_applied || "n/a"})
                </p>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <Dialog
        open={Boolean(confirmingRequest)}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmingRequest(null)
            setRequestActionError(null)
          }
        }}
      >
        <DialogContent className="max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:data-[state=closed]:translate-y-full max-sm:data-[state=open]:translate-y-0 transition-transform duration-300 ease-out">
          <DialogHeader>
            <DialogTitle>Confirm this booking?</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 text-sm text-[#6A5848]">
            <p>
              {selectedConfirmRequest?.guest_name ?? "Guest"} ·{" "}
              {sessionLabel(
                selectedConfirmRequest?.session_date ?? null,
                selectedConfirmRequest?.start_time ?? null,
                selectedConfirmRequest?.end_time ?? null
              )}
            </p>
            <p>
              You&apos;ll receive {formatMoney(Number(selectedConfirmRequest?.host_payout ?? 0))} after their
              session.
            </p>
          </div>
          {requestActionError ? <p className="text-sm text-destructive">{requestActionError}</p> : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmingRequest(null)
                setRequestActionError(null)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => (confirmingRequest ? void confirmPendingRequest(confirmingRequest) : undefined)}
              disabled={!confirmingRequest || requestActionLoading === confirmingRequest}
            >
              Yes, confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(decliningRequest)}
        onOpenChange={(open) => {
          if (!open) setDecliningRequest(null)
        }}
      >
        <DialogContent className="max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:data-[state=closed]:translate-y-full max-sm:data-[state=open]:translate-y-0 transition-transform duration-300 ease-out">
          <DialogHeader>
            <DialogTitle>Decline this booking request?</DialogTitle>
          </DialogHeader>
          {selectedDeclineRequest ? (
            <p className="text-sm text-[#6A5848]">
              {selectedDeclineRequest.guest_name ?? "Guest"} ·{" "}
              {sessionLabel(
                selectedDeclineRequest.session_date,
                selectedDeclineRequest.start_time,
                selectedDeclineRequest.end_time
              )}
            </p>
          ) : null}
          <div className="space-y-2">
            <p className="text-sm text-[#6A5848]">Reason (optional)</p>
            <div className="grid grid-cols-1 gap-2">
              {[
                "Space unavailable",
                "Dates no longer available",
                "Guest requirements don't match",
                "Other",
              ].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDeclineReason(option)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    declineReason === option ? "border-[#C75B3A] bg-[#FFF3EC] text-[#7A3F2D]" : "border-[#E9DFD3] bg-white"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecliningRequest(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                decliningRequest ? void declinePendingRequest(decliningRequest, declineReason || null) : undefined
              }
              disabled={!decliningRequest || requestActionLoading === decliningRequest}
            >
              Decline booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
