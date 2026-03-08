"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Calendar, CalendarDays, Check, Copy, Handshake, KeyRound, List, Lock, MapPin, Smartphone, Star, User } from "lucide-react"

import { CancelModal } from "@/components/booking/CancelModal"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ACCESS_TYPES, resolveInstructions } from "@/lib/constants/access-types"

type BookingStatus = "pending" | "pending_host" | "confirmed" | "cancelled" | "completed" | "declined" | string
type ViewMode = "list" | "calendar"
type TabKey = "upcoming" | "completed" | "cancelled"

type BookingRecord = {
  id: string
  listing_id: string | null
  session_date: string | null
  start_time: string | null
  end_time: string | null
  duration_hours: number | null
  guest_count: number | null
  status: BookingStatus
  total_charged: number | null
  subtotal: number | null
  service_fee: number | null
  price_per_person: number | null
  access_code: string | null
  access_code_sent_at?: string | null
  conversation_id?: string | null
  refunded_amount?: number | null
  refunded_at?: string | null
  review_submitted?: boolean | null
  confirmation_deadline?: string | null
  host_decline_reason?: string | null
  listings: {
    id: string
    title: string | null
    service_type: string | null
    sauna_type: string | null
    location: string | null
    location_address: string | null
    city: string | null
    state: string | null
    country: string | null
    lat: number | null
    lng: number | null
    photo_url: string | null
    access_type?: string | null
    access_instructions?: string | null
    access_code_send_timing?: string | null
  } | null
  host: {
    id: string
    full_name: string | null
    avatar_url: string | null
  } | null
  review: {
    id: string
    rating: number
    comment: string | null
    created_at?: string | null
  } | null
}

function serviceEmoji(serviceType: string | null) {
  const key = (serviceType ?? "sauna").toLowerCase()
  if (key === "cold_plunge") return "🧊"
  if (key === "float_tank") return "🛁"
  if (key === "cryotherapy") return "❄️"
  if (key === "infrared_light") return "🔴"
  if (key === "contrast_therapy") return "♨️"
  if (key === "pemf") return "⚡"
  if (key === "hyperbaric") return "🫧"
  if (key === "halotherapy") return "🌬️"
  return "🔥"
}

function serviceName(serviceType: string | null) {
  const key = (serviceType ?? "sauna").toLowerCase()
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

const ACCESS_ICON_MAP = {
  KeyRound,
  Lock,
  Handshake,
  Smartphone,
  User,
} as const

function timingLabel(timing: string | null | undefined) {
  if (timing === "on_confirm") return "once the booking is confirmed"
  if (timing === "24h_before") return "24 hours before your session"
  if (timing === "1h_before") return "1 hour before your session"
  return "before your session"
}

function formatDuration(hours: number | null) {
  const value = Number(hours ?? 0)
  if (!value) return "1 hr"
  return `${value} ${value === 1 ? "hr" : "hrs"}`
}

function parseSessionDate(date: string | null) {
  if (!date) return null
  const parsed = new Date(`${date}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isToday(sessionDate: string | null) {
  const date = parseSessionDate(sessionDate)
  if (!date) return false
  const now = new Date()
  return date.toDateString() === now.toDateString()
}

function isCancellationOpen(booking: BookingRecord) {
  if (!booking.session_date || !booking.start_time) return { open: false, hoursRemaining: 0 }
  const startsAt = new Date(`${booking.session_date}T${booking.start_time}`)
  const deadline = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000)
  const diffMs = deadline.getTime() - Date.now()
  return { open: diffMs > 0, hoursRemaining: Math.floor(diffMs / (1000 * 60 * 60)) }
}

function formatCancellationWindow(hoursRemaining: number) {
  const totalHours = Math.max(0, Math.floor(hoursRemaining))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24

  if (days > 0 && hours > 0) {
    return `${days} ${days === 1 ? "day" : "days"} and ${hours} ${hours === 1 ? "hour" : "hours"}`
  }
  if (days > 0) {
    return `${days} ${days === 1 ? "day" : "days"}`
  }
  return `${hours} ${hours === 1 ? "hour" : "hours"}`
}

function getRefundSummary(booking: BookingRecord) {
  const amount = Number(booking.refunded_amount ?? 0)
  if (amount > 0 && booking.refunded_at) {
    return `Refunded $${amount.toFixed(0)} on ${new Date(booking.refunded_at).toLocaleDateString()}`
  }
  return "No refund issued"
}

function within48Hours(value: string | null | undefined) {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return Date.now() - date.getTime() < 48 * 60 * 60 * 1000
}

function formatDateTime(booking: BookingRecord) {
  if (!booking.session_date) return "Date TBD"
  const date = new Date(`${booking.session_date}T12:00:00`)
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date)
  const start = booking.start_time
    ? new Date(`${booking.session_date}T${booking.start_time}`).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "TBD"
  const end = booking.end_time
    ? new Date(`${booking.session_date}T${booking.end_time}`).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "TBD"
  return `${dateLabel} · ${start}–${end}`
}

function statusPill(status: BookingStatus) {
  if (status === "confirmed" || status === "completed") {
    return "bg-emerald-100 text-emerald-700"
  }
  if (status === "pending_host") return "bg-amber-100 text-amber-800"
  if (status === "pending") return "bg-amber-100 text-amber-700"
  if (status === "declined") return "bg-rose-100 text-rose-700"
  if (status === "cancelled") return "bg-zinc-200 text-zinc-700"
  return "bg-zinc-100 text-zinc-700"
}

function formatDeadline(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed)
}

function serviceTypePill(serviceType: string | null) {
  const base = "rounded-full px-3 py-1 text-xs"
  const key = (serviceType ?? "sauna").toLowerCase()
  if (key === "cold_plunge") return `${base} bg-sky-100 text-sky-700`
  if (key === "infrared_light") return `${base} bg-rose-100 text-rose-700`
  if (key === "float_tank") return `${base} bg-indigo-100 text-indigo-700`
  return `${base} bg-[#FDEBDD] text-[#C75B3A]`
}

function downloadIcs(booking: BookingRecord) {
  if (!booking.session_date || !booking.start_time || !booking.end_time) return
  const start = new Date(`${booking.session_date}T${booking.start_time}`)
  const end = new Date(`${booking.session_date}T${booking.end_time}`)
  const toIcs = (value: Date) =>
    value.toISOString().replace(/[-:]/g, "").replace(".000", "")
  const title = booking.listings?.title ?? "Thrml session"
  const description = `Booking ${booking.id}`
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Thrml//Bookings//EN",
    "BEGIN:VEVENT",
    `UID:${booking.id}@thrml`,
    `DTSTAMP:${toIcs(new Date())}`,
    `DTSTART:${toIcs(start)}`,
    `DTEND:${toIcs(end)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n")

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `thrml-booking-${booking.id}.ics`
  anchor.click()
  URL.revokeObjectURL(url)
}

function BookingSkeleton() {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-[0_8px_30px_rgba(26,20,16,0.06)] md:p-5">
      <div className="grid animate-pulse gap-4 md:grid-cols-[180px_1fr_180px]">
        <div className="h-32 rounded-2xl bg-[#EEE7DE]" />
        <div className="space-y-3">
          <div className="h-4 w-32 rounded bg-[#EEE7DE]" />
          <div className="h-6 w-2/3 rounded bg-[#EEE7DE]" />
          <div className="h-4 w-1/2 rounded bg-[#EEE7DE]" />
          <div className="h-4 w-2/3 rounded bg-[#EEE7DE]" />
        </div>
        <div className="space-y-3">
          <div className="h-7 w-24 rounded bg-[#EEE7DE]" />
          <div className="h-5 w-20 rounded bg-[#EEE7DE]" />
          <div className="h-10 w-full rounded-xl bg-[#EEE7DE]" />
        </div>
      </div>
    </div>
  )
}

export function DashboardBookingsClient({ userRole = "guest" }: { userRole?: "guest" | "host" }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [activeTab, setActiveTab] = useState<TabKey>("upcoming")
  const [bookings, setBookings] = useState<BookingRecord[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [mobileOpenId, setMobileOpenId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openingConversationId, setOpeningConversationId] = useState<string | null>(null)
  const [copiedBookingId, setCopiedBookingId] = useState<string | null>(null)

  async function loadBookings() {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await fetch("/api/bookings")
      if (response.status === 401) {
        window.location.href = "/login"
        return
      }
      const payload = (await response.json()) as { bookings?: BookingRecord[]; error?: string }
      if (!response.ok) {
        setBookings([])
        setLoadError(payload.error ?? "Unable to load bookings right now.")
        return
      }
      setBookings(payload.bookings ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBookings()
  }, [])

  useEffect(() => {
    const toast = searchParams.get("toast")
    if (!toast) return
    setToastMessage(toast)
    const timeout = window.setTimeout(() => setToastMessage(null), 2800)
    return () => window.clearTimeout(timeout)
  }, [searchParams])

  const grouped = useMemo(() => {
    const now = new Date()
    const upcoming: BookingRecord[] = []
    const completed: BookingRecord[] = []
    const cancelled: BookingRecord[] = []

    for (const booking of bookings) {
      if (booking.status === "cancelled") {
        cancelled.push(booking)
        continue
      }
      if (booking.status === "declined") {
        cancelled.push(booking)
        continue
      }

      if (booking.status === "completed") {
        completed.push(booking)
        continue
      }

      const date = parseSessionDate(booking.session_date)
      if (!date) {
        if (booking.status === "pending" || booking.status === "pending_host" || booking.status === "confirmed") {
          upcoming.push(booking)
        }
        continue
      }

      if (booking.status !== "pending" && booking.status !== "pending_host" && booking.status !== "confirmed") {
        if (date >= new Date(now.toDateString())) {
          upcoming.push(booking)
        } else {
          completed.push(booking)
        }
        continue
      }

      if (date >= new Date(now.toDateString())) {
        upcoming.push(booking)
      } else {
        completed.push(booking)
      }
    }

    upcoming.sort((a, b) => (a.session_date ?? "").localeCompare(b.session_date ?? ""))
    completed.sort((a, b) => (b.session_date ?? "").localeCompare(a.session_date ?? ""))
    cancelled.sort((a, b) => (b.session_date ?? "").localeCompare(a.session_date ?? ""))

    return { upcoming, completed, cancelled }
  }, [bookings])

  const counts = {
    upcoming: grouped.upcoming.length,
    completed: grouped.completed.length,
    cancelled: grouped.cancelled.length,
  }

  const visible = activeTab === "upcoming" ? grouped.upcoming : activeTab === "completed" ? grouped.completed : grouped.cancelled

  async function cancelBooking(bookingId: string, reason?: string) {
    await fetch(`/api/bookings/${bookingId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancelled_by: userRole, reason }),
    })
    await loadBookings()
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

  async function handleMessageHost(booking: BookingRecord) {
    if (openingConversationId) return
    setOpeningConversationId(booking.id)
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id }),
      })
      if (!response.ok) return
      const payload = (await response.json()) as { conversation?: { id?: string } }
      const conversationId = payload.conversation?.id
      if (conversationId) {
        router.push(`/dashboard/messages/${conversationId}`)
      }
    } finally {
      setOpeningConversationId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F3EE] text-[#1A1410]">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <header className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="font-serif text-4xl">Your Rituals</h1>
            <p className="mt-2 text-sm text-[#6C5B4F]">
              {counts.upcoming} upcoming · {counts.completed} completed
            </p>
          </div>
          <div className="inline-flex rounded-full bg-white p-1 shadow-[0_4px_20px_rgba(26,20,16,0.08)]">
            <button
              onClick={() => setViewMode("list")}
              className={`rounded-full px-4 py-2 text-sm ${viewMode === "list" ? "bg-[#F3E8DE] text-[#C75B3A]" : "text-[#6C5B4F]"}`}
            >
              <List className="mr-1 inline size-4" />
              List view
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`rounded-full px-4 py-2 text-sm ${viewMode === "calendar" ? "bg-[#F3E8DE] text-[#C75B3A]" : "text-[#6C5B4F]"}`}
            >
              <Calendar className="mr-1 inline size-4" />
              Calendar view
            </button>
          </div>
        </header>

        <div className="sticky top-0 z-10 mb-6 border-b border-[#E6DDD3] bg-[#F7F3EE]/95 backdrop-blur">
          <nav className="flex gap-6 overflow-x-auto pt-1">
            {(["upcoming", "completed", "cancelled"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`relative pb-3 text-sm capitalize transition-colors ${
                  activeTab === tab ? "text-[#1A1410]" : "text-[#7C6B5E]"
                }`}
              >
                {tab}
                <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs">{counts[tab]}</span>
                {activeTab === tab ? <span className="absolute right-0 bottom-0 left-0 h-0.5 bg-[#C75B3A]" /> : null}
              </button>
            ))}
          </nav>
        </div>

        {viewMode === "calendar" ? (
          <div className="rounded-3xl bg-white p-10 text-center shadow-[0_8px_30px_rgba(26,20,16,0.06)]">
            <CalendarDays className="mx-auto mb-3 size-7 text-[#C75B3A]" />
            <p className="font-serif text-2xl">Calendar view</p>
            <p className="mt-1 text-sm text-[#7C6B5E]">Coming soon</p>
          </div>
        ) : null}

        {viewMode === "list" ? (
          <section className="space-y-4 transition-all duration-200">
            {loadError ? (
              <div className="rounded-3xl border border-[#FDE68A] bg-[#FFFBEB] p-5 text-sm text-[#92400E]">
                {loadError}
              </div>
            ) : null}
            {loading ? (
              <>
                <BookingSkeleton />
                <BookingSkeleton />
                <BookingSkeleton />
              </>
            ) : visible.length === 0 ? (
              <div className="rounded-3xl bg-white p-10 text-center shadow-[0_8px_30px_rgba(26,20,16,0.06)]">
                <p className="mb-3 text-4xl">{activeTab === "upcoming" ? "🔥" : activeTab === "completed" ? "✨" : "🧾"}</p>
                <p className="font-serif text-2xl">
                  {activeTab === "upcoming"
                    ? "No upcoming sessions"
                    : activeTab === "completed"
                      ? "No past sessions yet"
                      : "No cancelled bookings"}
                </p>
                <p className="mt-1 text-sm text-[#7C6B5E]">
                  {activeTab === "upcoming"
                    ? "Time to book your next ritual"
                    : activeTab === "completed"
                      ? "Once you complete a booking it will appear here"
                      : "You're all set"}
                </p>
                {activeTab !== "cancelled" ? (
                  <Link href="/explore" className="mt-4 inline-flex rounded-xl bg-[#C75B3A] px-4 py-2 text-sm text-white">
                    Explore services
                  </Link>
                ) : null}
              </div>
            ) : (
              visible.map((booking) => {
                const location =
                  booking.listings?.location ??
                  [booking.listings?.city, booking.listings?.state, booking.listings?.country].filter(Boolean).join(", ") ??
                  "Location shared after booking"
                const cancellation = isCancellationOpen(booking)
                const canShowAddress =
                  booking.status !== "pending" &&
                  booking.status !== "pending_host" &&
                  booking.status !== "cancelled" &&
                  booking.status !== "declined"
                const accessTypeKey = (booking.listings?.access_type ?? "code") as keyof typeof ACCESS_TYPES
                const accessTypeMeta = ACCESS_TYPES[accessTypeKey] ?? ACCESS_TYPES.code
                const showAccessDetails = booking.status === "confirmed"
                const hasSentAccessDetails = Boolean(booking.access_code_sent_at)
                const confirmationDeadlineLabel =
                  booking.status === "pending_host" ? formatDeadline(booking.confirmation_deadline ?? null) : null
                const total = Number(booking.total_charged ?? 0)
                const subtotal = Number(booking.subtotal ?? total / 1.12)
                const serviceFee = Number(booking.service_fee ?? total - subtotal)

                return (
                  <article
                    key={booking.id}
                    className={`rounded-3xl bg-white p-4 shadow-[0_8px_30px_rgba(26,20,16,0.06)] md:p-5 ${
                      booking.status === "cancelled" ? "opacity-75 grayscale-[0.15]" : ""
                    }`}
                  >
                    <div className="grid gap-4 md:grid-cols-[190px_1fr_210px]">
                      <div className="h-40 overflow-hidden rounded-2xl md:h-32">
                        {booking.listings?.photo_url ? (
                          <img
                            src={booking.listings.photo_url}
                            alt={booking.listings?.title ?? "Booking photo"}
                            className={`h-full w-full object-cover ${
                              activeTab === "completed" ? "saturate-50 opacity-80" : ""
                            }`}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#F1E5D8] to-[#ECD8C7] text-3xl">
                            <div className="text-center">
                              <p>{serviceEmoji(booking.listings?.service_type ?? null)}</p>
                              <p className="mt-1 text-xs text-[#6C5B4F]">{serviceName(booking.listings?.service_type ?? null)}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <h3 className="font-serif text-[20px] leading-tight">{booking.listings?.title ?? "Thrml session"}</h3>
                        <p className="text-sm text-[#7C6B5E]">with {booking.host?.full_name ?? "Thrml host"}</p>
                        <p className="text-sm font-semibold">{formatDateTime(booking)}</p>
                        {booking.status === "pending_host" && confirmationDeadlineLabel ? (
                          <p className="text-xs text-amber-700">Host must respond by {confirmationDeadlineLabel}</p>
                        ) : null}
                        <p className="text-sm text-[#5E4E42]">
                          {booking.guest_count ?? 1} guests · {formatDuration(booking.duration_hours)}
                        </p>
                        <p className="flex items-center gap-1 text-sm text-[#6C5B4F]">
                          <MapPin className="size-3.5" />
                          {location}
                        </p>
                      </div>

                      <div className="flex flex-col items-start gap-2 md:h-full md:items-end">
                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                          <span className={serviceTypePill(booking.listings?.service_type ?? null)}>
                            {serviceEmoji(booking.listings?.service_type ?? null)} {serviceName(booking.listings?.service_type ?? null)}
                          </span>
                          {isToday(booking.session_date) ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#FDEBDD] px-2 py-0.5 text-xs text-[#C75B3A]">
                              <span className="size-1.5 animate-pulse rounded-full bg-[#C75B3A]" />
                              Today
                            </span>
                          ) : null}
                        </div>

                        {activeTab === "completed" ? (
                          <>
                            {booking.review || booking.review_submitted ? (
                              <div className="text-right">
                                <p className="text-xs text-[#8A796B]">You rated this ★{Math.max(1, booking.review?.rating ?? 0)}</p>
                                {within48Hours(booking.review?.created_at ?? null) && booking.review ? (
                                  <Link
                                    href={`/review/${booking.id}?from=dashboard&edit=${booking.review.id}`}
                                    className="text-xs text-[#6A5A4D] underline"
                                  >
                                    Edit review →
                                  </Link>
                                ) : null}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-[14px] text-[#8B7A6D]">How was your session?</p>
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <Link
                                      key={star}
                                      href={`/review/${booking.id}?from=dashboard&initial_rating=${star}`}
                                      aria-label={`Rate ${star} stars`}
                                      className="text-[#CDBFB0] hover:text-[#F5A76C]"
                                    >
                                      <Star className="size-6" />
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}
                            <Link
                              href={`/explore?listing_id=${booking.listing_id ?? ""}`}
                              className="rounded-xl bg-[#C75B3A] px-3 py-2 text-sm text-white"
                            >
                              Book again
                            </Link>
                          </>
                        ) : activeTab === "cancelled" ? (
                          <>
                            <p className="text-sm text-emerald-700/80">{getRefundSummary(booking)}</p>
                            <Link
                              href={`/explore?service_type=${booking.listings?.service_type ?? "sauna"}`}
                              className="rounded-xl bg-[#EFE7DE] px-3 py-2 text-sm text-[#5E4E42]"
                            >
                              Find similar
                            </Link>
                          </>
                        ) : (
                          <>
                            <div className="md:mt-auto">
                              <Button
                                onClick={() => setExpandedId((prev) => (prev === booking.id ? null : booking.id))}
                                className="rounded-xl bg-[#C75B3A] text-white hover:bg-[#b44f31]"
                              >
                                View details
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {activeTab === "upcoming" && expandedId === booking.id ? (
                      <div className="mt-4 hidden grid-cols-1 gap-4 rounded-2xl bg-[#FBF8F4] p-4 md:grid md:grid-cols-2">
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-3">
                            <img
                              src={booking.host?.avatar_url ?? "/placeholder-avatar.png"}
                              alt={booking.host?.full_name ?? "Host"}
                              className="size-10 rounded-full bg-[#EEE7DE] object-cover"
                            />
                            <div>
                              <p className="text-sm font-medium">{booking.host?.full_name ?? "Thrml host"}</p>
                              <button
                                type="button"
                                className="text-xs text-[#6C5B4F] underline disabled:no-underline"
                                onClick={() => void handleMessageHost(booking)}
                                disabled={openingConversationId === booking.id}
                              >
                                {openingConversationId === booking.id ? "Opening chat..." : "Message host"}
                              </button>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs uppercase text-[#8A7769]">Address</p>
                            <p className="text-sm">
                              {canShowAddress
                                ? booking.listings?.location_address ?? booking.listings?.location ?? "Address unavailable"
                                : "Address unlocks after payment is confirmed."}
                            </p>
                          </div>
                          <div className="space-y-0.5 pt-2">
                            <p className={`text-sm leading-snug ${cancellation.open ? "text-emerald-700" : "text-rose-700/80"}`}>
                              {cancellation.open
                                ? `Free cancellation for ~${formatCancellationWindow(cancellation.hoursRemaining)}`
                                : "Non-refundable"}
                            </p>
                            <div>
                              <CancelModal
                                booking={{
                                  id: booking.id,
                                  session_date: booking.session_date,
                                  start_time: booking.start_time,
                                  end_time: booking.end_time,
                                  listing_title: booking.listings?.title ?? null,
                                  service_fee: booking.service_fee,
                                }}
                                userRole="guest"
                                onConfirm={({ reason }) => cancelBooking(booking.id, reason)}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="rounded-xl bg-white p-3">
                            {showAccessDetails ? (
                              hasSentAccessDetails ? (
                                <div className="mb-3 rounded-lg border border-[#E9DFD3] bg-[#FCFAF7] p-3">
                                  <div className="flex items-center gap-2 text-sm font-medium text-[#1A1410]">
                                    {(() => {
                                      const Icon =
                                        ACCESS_ICON_MAP[
                                          (accessTypeMeta.icon as keyof typeof ACCESS_ICON_MAP) ?? "KeyRound"
                                        ] ?? KeyRound
                                      return <Icon className="size-4" />
                                    })()}
                                    How to get in
                                  </div>
                                  {accessTypeMeta.supportsCode && booking.access_code ? (
                                    <div className="mt-2 rounded-lg bg-[#F5EFE9] p-3">
                                      <p className="text-xs text-[#6D5E51]">
                                        {accessTypeKey === "lockbox" ? "Lockbox combination" : "Access code"}
                                      </p>
                                      <div className="mt-1 flex items-center justify-between gap-2">
                                        <p className="font-mono text-lg tracking-[0.15em] text-[#5D4D41]">{booking.access_code}</p>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            booking.access_code
                                              ? void copyAccessCode(booking.id, booking.access_code)
                                              : undefined
                                          }
                                          className="inline-flex items-center gap-1 rounded-md border border-[#E8BE9A] bg-[#FFF9F3] px-2 py-1 text-xs text-[#C75B3A] hover:bg-[#FFF1E5]"
                                        >
                                          {copiedBookingId === booking.id ? (
                                            <>
                                              <Check className="size-3.5" />
                                              Copied!
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="size-3.5" />
                                              Copy
                                            </>
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                  <p className="mt-2 text-xs uppercase tracking-wide text-[#8A7769]">Entry instructions</p>
                                  <p className="mt-1 text-sm text-[#5E4E42]">
                                    {resolveInstructions(booking.listings?.access_instructions ?? "", {
                                      code: booking.access_code ?? "",
                                      date: booking.session_date
                                        ? new Date(`${booking.session_date}T12:00:00`).toLocaleDateString(undefined, {
                                            month: "long",
                                            day: "numeric",
                                            year: "numeric",
                                          })
                                        : "",
                                      time:
                                        booking.session_date && booking.start_time
                                          ? new Date(`${booking.session_date}T${booking.start_time}`).toLocaleTimeString([], {
                                              hour: "numeric",
                                              minute: "2-digit",
                                            })
                                          : "",
                                      guestName: "there",
                                      duration: formatDuration(booking.duration_hours),
                                    })}
                                  </p>
                                  <div className="mt-2 border-t border-dashed pt-2 text-xs">
                                    <p className="text-[#6C5B4F]">Having trouble getting in?</p>
                                    {booking.conversation_id ? (
                                      <Link className="text-[#C75B3A] underline" href={`/dashboard/messages/${booking.conversation_id}`}>
                                        Message {booking.host?.full_name?.split(" ")[0] ?? "host"} →
                                      </Link>
                                    ) : null}
                                  </div>
                                </div>
                              ) : (
                                <div className="mb-3 rounded-lg border border-[#E9DFD3] bg-[#F8F4EF] p-3 text-sm text-[#6A5848]">
                                  🔐 Access details will be sent {timingLabel(booking.listings?.access_code_send_timing)}.
                                </div>
                              )
                            ) : null}
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm">${Number(booking.price_per_person ?? 0).toFixed(0)} × {booking.guest_count ?? 1} guests × {booking.duration_hours ?? 1}h</p>
                                <p className="text-sm text-[#6C5B4F]">Subtotal: ${subtotal.toFixed(0)}</p>
                                <p className="text-sm text-[#6C5B4F]">Service fee (12%): ${serviceFee.toFixed(0)}</p>
                                <p className="mt-2 border-t border-dashed pt-2 text-sm font-semibold">Total: ${total.toFixed(0)}</p>
                              </div>
                              <span className={`shrink-0 rounded-full px-3 py-1 text-xs capitalize ${statusPill(booking.status)}`}>
                                {booking.status === "completed"
                                  ? "Confirmed"
                                  : booking.status === "pending_host"
                                    ? "Awaiting host"
                                    : booking.status}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => downloadIcs(booking)}>
                              Add to Calendar
                            </Button>
                            {booking.status === "pending_host" ? (
                              <Button
                                variant="outline"
                                className="border-rose-200 text-rose-700 hover:bg-rose-50"
                                onClick={() => void cancelBooking(booking.id, "guest_cancelled_request")}
                              >
                                Cancel request
                              </Button>
                            ) : null}
                            <Button
                              variant="outline"
                              onClick={() =>
                                window.open(
                                  `https://www.google.com/maps/search/?api=1&query=${booking.listings?.lat ?? ""},${booking.listings?.lng ?? ""}`,
                                  "_blank"
                                )
                              }
                            >
                              Get directions
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {activeTab === "upcoming" ? (
                      <div className="mt-3 md:hidden">
                        <Sheet open={mobileOpenId === booking.id} onOpenChange={(open) => setMobileOpenId(open ? booking.id : null)}>
                          <SheetTrigger asChild>
                            <Button variant="outline" className="w-full">View details</Button>
                          </SheetTrigger>
                          <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-3xl">
                            <SheetHeader>
                              <SheetTitle>{booking.listings?.title ?? "Thrml session"}</SheetTitle>
                            </SheetHeader>
                            <div className="space-y-4 px-4 pb-6 text-sm">
                              <p>{canShowAddress ? booking.listings?.location_address ?? booking.listings?.location : "Address unlocks after payment."}</p>
                              {showAccessDetails ? (
                                hasSentAccessDetails ? (
                                  <div className="w-full rounded-lg border border-[#E9DFD3] bg-[#FCFAF7] p-2">
                                    <p className="text-sm font-medium">How to get in</p>
                                    {accessTypeMeta.supportsCode && booking.access_code ? (
                                      <div className="mt-1 rounded bg-[#F5EFE9] p-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="font-mono text-sm tracking-[0.2em] text-[#5D4D41]">{booking.access_code}</p>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              booking.access_code
                                                ? void copyAccessCode(booking.id, booking.access_code)
                                                : undefined
                                            }
                                            className="inline-flex items-center gap-1 rounded-md border border-[#E8BE9A] bg-[#FFF9F3] px-2 py-1 text-xs text-[#C75B3A]"
                                          >
                                            {copiedBookingId === booking.id ? "Copied!" : "Copy"}
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : (
                                  <div className="rounded-lg border border-[#E9DFD3] bg-[#F8F4EF] p-2 text-xs text-[#6A5848]">
                                    🔐 Access details will be sent {timingLabel(booking.listings?.access_code_send_timing)}.
                                  </div>
                                )
                              ) : null}
                              <Button className="w-full" variant="outline" onClick={() => downloadIcs(booking)}>
                                Add to Calendar
                              </Button>
                            </div>
                          </SheetContent>
                        </Sheet>
                      </div>
                    ) : null}

                  </article>
                )
              })
            )}
          </section>
        ) : null}
      </div>
      {toastMessage ? (
        <div className="fixed right-4 bottom-4 z-50 rounded-xl border border-[#ECDCCF] bg-white px-4 py-3 text-sm text-[#5E4E42] shadow-lg">
          {toastMessage}
        </div>
      ) : null}
    </div>
  )
}
