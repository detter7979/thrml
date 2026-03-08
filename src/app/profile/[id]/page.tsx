import { notFound } from "next/navigation"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { createClient } from "@/lib/supabase/server"

export default async function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, bio, created_at, phone_verified")
    .eq("id", id)
    .maybeSingle()

  if (!profile) notFound()

  const [{ count: guestBookings }, { count: totalListings }, { count: reviewsReceived }] = await Promise.all([
    supabase.from("bookings").select("*", { count: "exact", head: true }).eq("guest_id", id),
    supabase.from("listings").select("*", { count: "exact", head: true }).eq("host_id", id),
    supabase.from("listing_reviews").select("*", { count: "exact", head: true }).eq("host_id", id),
  ])

  const initials = (profile.full_name ?? "M")
    .split(" ")
    .map((part: string) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
  const memberSince = profile.created_at
    ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(profile.created_at))
    : "Recently"

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar size="lg">
            <AvatarImage src={profile.avatar_url ?? undefined} alt={profile.full_name ?? "Profile"} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-serif text-3xl text-[#1A1410]">{profile.full_name ?? "Thrml member"}</h1>
            <p className="text-sm text-[#7A6A5D]">Member since {memberSince}</p>
            {profile.phone_verified ? <p className="mt-1 text-xs text-[#5B8A69]">📱 Verified</p> : null}
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
