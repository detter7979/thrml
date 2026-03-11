import Link from "next/link"
import { redirect } from "next/navigation"

import { AccessCodeCard } from "@/components/booking/AccessCodeCard"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { PendingRefresh } from "./pending-refresh"

type SearchParams = {
  bookingId?: string
  listingId?: string
}

function toCalendarDateTime(sessionDate: string | null, time: string | null, fallbackHour: number) {
  const date = sessionDate ? new Date(`${sessionDate}T00:00:00`) : new Date()
  const [hours, minutes] = (time ?? "")
    .split(":")
    .map((part) => Number(part))
  date.setHours(Number.isFinite(hours) ? hours : fallbackHour, Number.isFinite(minutes) ? minutes : 0, 0, 0)

  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(date.getUTCDate()).padStart(2, "0")
  const hh = String(date.getUTCHours()).padStart(2, "0")
  const min = String(date.getUTCMinutes()).padStart(2, "0")
  const sec = String(date.getUTCSeconds()).padStart(2, "0")
  return `${yyyy}${mm}${dd}T${hh}${min}${sec}Z`
}

function formatMoney(value: number | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value ?? 0)
}

function formatBookingDateTime(sessionDate: string | null, startTime: string | null, endTime: string | null) {
  if (!sessionDate) return "Date TBD"
  const date = new Date(`${sessionDate}T12:00:00`)
  if (Number.isNaN(date.getTime())) return "Date TBD"
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date)

  const formatTime = (time: string | null) => {
    if (!time) return "TBD"
    const parsed = new Date(`${sessionDate}T${time}`)
    if (Number.isNaN(parsed.getTime())) return "TBD"
    return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  }

  return `${dateLabel} · ${formatTime(startTime)}–${formatTime(endTime)}`
}

export default async function BookingConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const query = await searchParams
  const bookingId = query.bookingId
  if (!bookingId) redirect("/")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/")

  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      "id, listing_id, session_date, start_time, end_time, guest_count, total_charged, access_code, status"
    )
    .eq("id", bookingId)
    .eq("guest_id", user.id)
    .single()

  if (error || !booking) redirect("/")

  const { data: listing } = await supabase
    .from("listings")
    .select("title, listing_photos(url, order_index)")
    .eq("id", booking.listing_id)
    .single()

  const title = listing?.title ?? "thrml Session"
  const photoUrl =
    (listing?.listing_photos ?? [])
      .slice()
      .sort((a: { order_index?: number | null }, b: { order_index?: number | null }) => (a.order_index ?? 999) - (b.order_index ?? 999))[0]
      ?.url ?? null

  const calendarStart = toCalendarDateTime(booking.session_date, booking.start_time, 10)
  const calendarEnd = toCalendarDateTime(booking.session_date, booking.end_time, 11)
  const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    `${title} - thrml`
  )}&dates=${calendarStart}/${calendarEnd}&details=${encodeURIComponent(
    `Booking #${booking.id} for ${booking.guest_count} guests.`
  )}`
  const awaitingHost = booking.status === "pending_host"

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 md:px-8">
      <PendingRefresh enabled={booking.status === "pending" || (booking.status === "confirmed" && !booking.access_code)} />
      <header className="space-y-1">
        <Link href="/dashboard/bookings" className="inline-flex min-h-[44px] items-center text-sm font-medium text-[#5D4D41] hover:underline">
          ← Back to bookings
        </Link>
        <h1 className="type-h1">{awaitingHost ? "Booking request sent" : "Booking confirmation"}</h1>
        <p className="type-label">
          {awaitingHost
            ? "Your card is authorized but won't be charged until the host confirms."
            : `Your booking is ${booking.status}. Keep your access code handy.`}
        </p>
      </header>

      <Card className="card-base">
        <CardContent className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
          {photoUrl ? (
            <img src={photoUrl} alt={title} className="h-44 w-full rounded-lg object-cover" />
          ) : (
            <div className="flex h-44 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
              Listing image
            </div>
          )}

          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-lg font-medium">{title}</p>
                <p className="text-muted-foreground">
                  {formatBookingDateTime(booking.session_date, booking.start_time, booking.end_time)}
                </p>
                <p className="text-muted-foreground">{booking.guest_count} guests</p>
                <p className="type-price">
                  {awaitingHost
                    ? `Authorization hold: ${formatMoney(booking.total_charged)}`
                    : `Total paid: ${formatMoney(booking.total_charged)}`}
                </p>
              </div>
              {!awaitingHost ? <AccessCodeCard code={booking.access_code} /> : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <a href={calendarUrl} target="_blank" rel="noopener noreferrer">
            Add to Calendar
          </a>
        </Button>
        <Button variant="outline" asChild>
          <Link href={query.listingId ? `/listings/${query.listingId}` : "/"}>Back to listing</Link>
        </Button>
      </div>
    </div>
  )
}
