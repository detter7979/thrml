import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
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

function bookingListingTitle(listings: unknown) {
  if (Array.isArray(listings)) {
    const first = listings[0]
    if (first && typeof first === "object" && "title" in first && typeof first.title === "string") {
      return first.title
    }
    return null
  }

  if (listings && typeof listings === "object" && "title" in listings && typeof listings.title === "string") {
    return listings.title
  }

  return null
}

export default async function DashboardOverviewPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/dashboard")

  const today = new Date().toISOString().slice(0, 10)
  const [{ data: profile }, { data: bookings, count: upcomingBookingsCount }, { data: listings }] = await Promise.all([
    supabase.from("profiles").select("full_name, created_at, ui_intent").eq("id", user.id).maybeSingle(),
    supabase
      .from("bookings")
      .select("id, session_date, start_time, end_time, guest_count, duration_hours, total_charged, listings(title)", {
        count: "exact",
      })
      .eq("guest_id", user.id)
      .in("status", ["pending_host", "pending", "confirmed"])
      .gte("session_date", today)
      .order("session_date", { ascending: true }),
    supabase
      .from("listings")
      .select("id, title, is_active, fixed_session_price, price_solo, deactivated_reason")
      .eq("host_id", user.id)
      .order("created_at", { ascending: false }),
  ])

  const visibleListings = (listings ?? [])
    .filter(
      (listing) =>
        !(
          listing.is_active === false &&
          typeof listing.deactivated_reason === "string" &&
          listing.deactivated_reason === "superseded_by_new_version"
        )
    )

  const firstName = (profile?.full_name ?? user.user_metadata.full_name ?? "there").split(" ")[0]
  const greeting = `${greetingForHour(new Date().getHours())}, ${firstName}.`

  const hasBookings = (bookings ?? []).length > 0
  const totalUpcomingBookings = Number(upcomingBookingsCount ?? bookings?.length ?? 0)
  const totalSpacesCount = visibleListings.length
  const hasListings = visibleListings.length > 0
  const guestOnly = !hasListings && (profile?.ui_intent ?? "guest") === "guest"

  return (
    <div className="space-y-6 px-4 py-6 md:px-8 md:py-8">
      <header className="space-y-1">
        <h1 className="font-serif text-4xl text-[#1A1410]">{greeting}</h1>
        <p className="text-sm text-[#7A6A5D]">Here is what is happening across your bookings and spaces.</p>
      </header>

      <section className="grid items-stretch gap-4 lg:grid-cols-2">
        <div className="flex h-full flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm">
          <div className="rounded-xl border border-[#EFE4D7] bg-[#FCF9F5] px-4 py-2">
            <h2 className="font-serif text-xl text-[#1A1410]">Your upcoming sessions ({totalUpcomingBookings})</h2>
          </div>
          {hasBookings ? (
            <div className="flex flex-1 flex-col gap-3">
              {(bookings ?? []).map((booking) => (
                <Link
                  key={booking.id}
                  href="/dashboard/bookings"
                  className="rounded-xl border border-[#EFE4D7] p-3 transition-colors duration-150 hover:bg-[#FCF9F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9C8B6] focus-visible:ring-offset-2"
                >
                  <p className="font-medium text-[#1A1410]">{bookingListingTitle(booking.listings) ?? "Wellness session"}</p>
                  <p className="text-xs text-[#7A6A5D]">
                    {formatBookingDateTime(booking.session_date, booking.start_time, booking.end_time)} ·{" "}
                    {booking.guest_count ?? 1} guests
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 flex-col justify-center gap-2 rounded-xl bg-[#FCF9F5] p-4">
              <p className="text-sm text-[#6D5E51]">No upcoming bookings.</p>
              <Button asChild className="btn-primary">
                <Link href="/explore">Find a space</Link>
              </Button>
            </div>
          )}
        </div>

        {guestOnly ? (
          <div className="space-y-2 rounded-2xl bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="font-serif text-2xl text-[#1A1410]">Hosting, when you want it</h2>
            <p className="text-sm text-[#6D5E51]">You are in guest mode right now. If you ever want to host, create a space in a few minutes.</p>
            <Button asChild className="btn-primary">
              <Link href="/dashboard/listings/new">Start hosting</Link>
            </Button>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm">
            <div className="rounded-xl border border-[#EFE4D7] bg-[#FCF9F5] px-4 py-2">
              <h2 className="font-serif text-xl text-[#1A1410]">Your spaces ({totalSpacesCount})</h2>
            </div>
            {hasListings ? (
              <div className="flex flex-1 flex-col gap-3">
                {visibleListings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/dashboard/listings/${listing.id}/edit`}
                    className="rounded-xl border border-[#EFE4D7] p-3 transition-colors duration-150 hover:bg-[#FCF9F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9C8B6] focus-visible:ring-offset-2"
                  >
                    <p className="font-medium text-[#1A1410]">{listing.title ?? "Untitled listing"}</p>
                    <p className="text-xs text-[#7A6A5D]">
                      {listing.is_active ? "Live" : "Draft"} · From $
                      {Number(listing.fixed_session_price ?? listing.price_solo ?? 0).toFixed(0)}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-1 flex-col justify-center gap-2 rounded-xl bg-[#FCF9F5] p-4">
                <p className="text-sm text-[#6D5E51]">Your first listing is 5 minutes away.</p>
                <Button asChild className="btn-primary">
                  <Link href="/dashboard/listings/new">Create your first listing</Link>
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
