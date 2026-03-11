import Link from "next/link"
import { redirect } from "next/navigation"

import { firstName } from "@/lib/reviews"
import { createClient } from "@/lib/supabase/server"

type Params = { bookingId: string }

export default async function ReviewSuccessPage({ params }: { params: Promise<Params> }) {
  const { bookingId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=/review/${bookingId}/success`)
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, guest_id, host_id, listing_id")
    .eq("id", bookingId)
    .maybeSingle()

  if (!booking || booking.guest_id !== user.id) {
    redirect("/dashboard/bookings")
  }

  const [{ data: host }, { data: listing }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", booking.host_id).maybeSingle(),
    supabase.from("listings").select("id").eq("id", booking.listing_id).maybeSingle(),
  ])

  const hostLabel = firstName(host?.full_name)
  const reviewHref = listing?.id ? `/listings/${listing.id}#reviews` : "/dashboard/bookings"

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F3EE] px-4">
      <div className="w-full max-w-xl rounded-3xl bg-white px-6 py-10 text-center shadow-[0_10px_40px_rgba(26,20,16,0.08)]">
        <div className="mx-auto mb-5 flex size-20 items-center justify-center rounded-full bg-[#F4ECE3]">
          <svg className="size-12" viewBox="0 0 52 52" aria-hidden="true">
            <circle className="success-circle" cx="26" cy="26" r="25" fill="none" />
            <path className="success-check" fill="none" d="M14 27 l8 8 l16 -16" />
          </svg>
        </div>

        <h1 className="font-serif text-[28px] leading-tight text-[#1A1410]">Thank you for your review!</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-[#7D6D60]">
          Your feedback helps {hostLabel} and the thrml community.
        </p>

        <div className="mt-8 space-y-3">
          <Link
            href={reviewHref}
            className="inline-flex w-full items-center justify-center rounded-xl bg-[#1F1712] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#120d0a]"
          >
            View your review →
          </Link>
          <Link
            href="/explore"
            className="inline-flex w-full items-center justify-center rounded-xl border border-[#D9CCBD] bg-white px-4 py-3 text-sm font-medium text-[#3F342B] transition hover:bg-[#FAF5EF]"
          >
            Find your next space →
          </Link>
        </div>
      </div>

      <style>{`
        .success-circle {
          stroke: #52b788;
          stroke-width: 2.5;
          stroke-dasharray: 166;
          stroke-dashoffset: 166;
          animation: draw-circle 700ms ease forwards;
        }
        .success-check {
          stroke: #2d6a4f;
          stroke-width: 4;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 48;
          stroke-dashoffset: 48;
          animation: draw-check 500ms 380ms ease forwards;
        }
        @keyframes draw-circle {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes draw-check {
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  )
}
