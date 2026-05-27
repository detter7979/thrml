import { notFound } from "next/navigation"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { StarRating } from "@/components/reviews/StarRating"
import {
  PUBLIC_PROFILE_COLUMNS,
  PUBLIC_PROFILES_TABLE,
} from "@/lib/supabase/public-profiles"
import { createClient } from "@/lib/supabase/server"

export default async function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from(PUBLIC_PROFILES_TABLE)
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq("id", id)
    .maybeSingle()

  if (!profile) notFound()

  const [{ count: guestBookings }, { count: totalListings }, { count: reviewsReceived }, { data: guestRating }] =
    await Promise.all([
    supabase.from("bookings").select("*", { count: "exact", head: true }).eq("guest_id", id),
    supabase.from("listings").select("*", { count: "exact", head: true }).eq("host_id", id),
    supabase.from("listing_reviews").select("*", { count: "exact", head: true }).eq("host_id", id),
    supabase.from("guest_ratings").select("avg_overall, review_count").eq("guest_id", id).maybeSingle(),
  ])

  const initials = (profile.full_name ?? "M")
    .split(" ")
    .map((part: string) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
  const memberSince = profile.host_since
    ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(profile.host_since))
    : "Recently"

  const guestReviewCount = Number(guestRating?.review_count ?? 0)
  const guestAvgRating = Number(guestRating?.avg_overall ?? 0)

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar size="lg">
            <AvatarImage src={profile.avatar_url ?? undefined} alt={profile.full_name ?? "Profile"} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-serif text-3xl text-[#1A1410]">{profile.full_name ?? "thrml member"}</h1>
            <p className="text-sm text-[#7A6A5D]">Member since {memberSince}</p>
            {guestReviewCount > 0 ? (
              <div className="mt-1 flex items-center gap-1.5">
                <StarRating value={guestAvgRating} size={14} />
                <span className="text-xs text-[#7A6A5D]">
                  {guestAvgRating.toFixed(1)} · {guestReviewCount} host rating{guestReviewCount === 1 ? "" : "s"}
                </span>
              </div>
            ) : null}
            {profile.id_verified ? <p className="mt-1 text-xs text-[#5B8A69]">✓ Identity verified</p> : null}
          </div>
        </div>
        {profile.bio ? <p className="mt-4 text-sm text-[#4B3E34]">{profile.bio}</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 text-center shadow-sm">
          <p className="font-serif text-3xl text-[#1A1410]">{guestBookings ?? 0}</p>
          <p className="text-xs text-[#7A6A5D]">Total bookings as guest</p>
        </div>
        <div className="rounded-xl bg-white p-4 text-center shadow-sm">
          <p className="font-serif text-3xl text-[#1A1410]">{totalListings ?? 0}</p>
          <p className="text-xs text-[#7A6A5D]">Total listings</p>
        </div>
        <div className="rounded-xl bg-white p-4 text-center shadow-sm">
          <p className="font-serif text-3xl text-[#1A1410]">{reviewsReceived ?? 0}</p>
          <p className="text-xs text-[#7A6A5D]">Reviews received</p>
        </div>
      </div>
    </div>
  )
}
