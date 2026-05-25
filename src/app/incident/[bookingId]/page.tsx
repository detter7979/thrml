import Link from "next/link"
import { redirect } from "next/navigation"

import { IncidentReportForm } from "@/components/incidents/IncidentReportForm"
import { formatSessionDate } from "@/lib/reviews"
import { createClient } from "@/lib/supabase/server"

type Params = { bookingId: string }

export const metadata = {
  robots: { index: false, follow: false },
}

function failRedirect(): never {
  redirect(`/dashboard/bookings?toast=${encodeURIComponent("This booking link is not available")}`)
}

export default async function IncidentReportPage({ params }: { params: Promise<Params> }) {
  const { bookingId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=/incident/${bookingId}`)
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, guest_id, listing_id, session_date")
    .eq("id", bookingId)
    .maybeSingle()

  if (!booking || booking.guest_id !== user.id) {
    failRedirect()
  }

  const { data: listing } = booking.listing_id
    ? await supabase.from("listings").select("title").eq("id", booking.listing_id).maybeSingle()
    : { data: null }

  const { data: existingIncident } = await supabase
    .from("incident_reports")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("reporter_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const listingTitle = listing?.title ?? "your session"
  const sessionLabel = formatSessionDate(typeof booking.session_date === "string" ? booking.session_date : null)

  return (
    <div className="min-h-screen bg-[#F7F3EE] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-[600px] space-y-6">
        <header className="rounded-2xl bg-white px-5 py-6 shadow-[0_6px_30px_rgba(26,20,16,0.08)] md:px-6">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#9D8D80]">Incident documentation</p>
          <h1 className="mt-2 font-serif text-[26px] leading-tight text-[#1A1410]">Tell us what happened</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#6C5B4F]">
            <span className="font-medium text-[#3F342B]">Your refund has already been processed.</span> This form helps
            us document what happened and support you — it is not required to receive your refund.
          </p>
          <p className="mt-3 text-[13px] text-[#8D7D70]">
            {listingTitle} · {sessionLabel}
          </p>
          <p className="mt-4 rounded-xl border border-[#E8DDD2] bg-[#FFFCF8] px-4 py-3 text-sm leading-relaxed text-[#6C5B4F]">
            We are sorry you had this experience. Share whatever you are comfortable with — optional fields help us
            understand the situation more fully, but only a brief description is required.
          </p>
        </header>

        <div className="rounded-2xl bg-[#FBF8F4] p-4 shadow-[0_8px_24px_rgba(26,20,16,0.05)] md:p-5">
          <IncidentReportForm
            bookingId={bookingId}
            userId={user.id}
            initialIncidentId={existingIncident?.id ?? null}
          />
        </div>

        <p className="text-center text-xs text-[#8D7D70]">
          <Link href="/dashboard/bookings" className="text-[#C75B3A] transition-colors hover:text-[#B45033]">
            ← Back to your bookings
          </Link>
        </p>
      </div>
    </div>
  )
}
