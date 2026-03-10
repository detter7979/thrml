import Link from "next/link"
import Image from "next/image"
import { cache, Suspense } from "react"
import { LayoutGrid, Plus, Settings } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { createClient } from "@/lib/supabase/server"

type HostProfile = {
  name: string
  avatarUrl: string | null
  rating: number | null
  totalReviews: number
}

type ListingSummary = {
  id: string
  title: string
  isActive: boolean
  deactivatedReason: string | null
}

type UpcomingBooking = {
  id: string
  listingId: string | null
  listingTitle: string
  listingThumbnail: string | null
  guestName: string
  sessionDate: string | null
  startTime: string | null
  status: string
}

type ConversationPreview = {
  id: string
  listingTitle: string | null
  unreadCount: number
  lastMessageAt: string | null
  body: string | null
  otherPartyName: string
  otherPartyAvatar: string | null
}

type EarningsSummary = {
  thisMonth: number
  allTime: number
}

type HostOverviewData = {
  profile: HostProfile
  listings: ListingSummary[]
  bookings: UpcomingBooking[]
  messages: ConversationPreview[]
  earnings: EarningsSummary
  unreadMessageTotal: number
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function initialsFrom(name: string) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
  return initials || "H"
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatSessionDateTime(sessionDate: string | null, startTime: string | null) {
  if (!sessionDate) return "Date TBD"
  const base = new Date(`${sessionDate}T${startTime ?? "12:00:00"}`)
  if (Number.isNaN(base.getTime())) return "Date TBD"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(base)
}

function relativeTime(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

async function getHostProfile(userId: string): Promise<HostProfile> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, average_rating, total_reviews")
    .eq("id", userId)
    .maybeSingle()
  const parsedTotalReviews = Number(data?.total_reviews ?? 0)
  return {
    name: asNonEmptyString(data?.full_name) ?? "Host",
    avatarUrl: asNonEmptyString(data?.avatar_url),
    rating:
      typeof data?.average_rating === "number" && Number.isFinite(data.average_rating)
        ? Number(data.average_rating.toFixed(1))
        : null,
    totalReviews: Number.isFinite(parsedTotalReviews) ? Math.max(0, parsedTotalReviews) : 0,
  }
}

async function getActiveListings(userId: string): Promise<ListingSummary[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("listings")
    .select("id, title, is_active, deactivated_reason")
    .eq("host_id", userId)
    .order("created_at", { ascending: false })

  return (data ?? [])
    .filter((row) => row.deactivated_reason !== "superseded_by_new_version")
    .map((row) => ({
      id: typeof row.id === "string" ? row.id : "",
      title: asNonEmptyString(row.title) ?? "Untitled listing",
      isActive: Boolean(row.is_active),
      deactivatedReason: asNonEmptyString(row.deactivated_reason),
    }))
    .filter((row) => row.id.length > 0)
}

async function getUpcomingBookings(userId: string, limit = 3): Promise<UpcomingBooking[]> {
  const supabase = await createClient()
  const now = new Date()
  const fetchLimit = Math.max(limit * 5, 20)
  const today = now
  const localDateIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const { data: hostListings } = await supabase.from("listings").select("id").eq("host_id", userId)
  const hostListingIds = (hostListings ?? [])
    .map((row) => (typeof row.id === "string" ? row.id : null))
    .filter((id): id is string => Boolean(id))

  if (!hostListingIds.length) return []

  const { data } = await supabase
    .from("bookings")
    .select(`
      id,
      listing_id,
      guest_id,
      session_date,
      start_time,
      status,
      guest:profiles!bookings_guest_id_fkey(
        full_name,
        avatar_url
      ),
      listing:listings(
        title,
        listing_photos(url, order_index)
      )
    `)
    .in("listing_id", hostListingIds)
    .eq("status", "confirmed")
    .gte("session_date", localDateIso)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(fetchLimit)

  const rows = data ?? []
  if (!rows.length) return []

  const normalized = rows
    .map((row) => {
      const listingId = typeof row.listing_id === "string" ? row.listing_id : null
      const sessionDate = asNonEmptyString(row.session_date)
      const startTime = asNonEmptyString(row.start_time)
      const startsAt = sessionDate ? new Date(`${sessionDate}T${startTime ?? "00:00:00"}`) : null
      const listing = Array.isArray(row.listing) ? row.listing[0] : row.listing
      const listingTitle = asNonEmptyString(listing?.title) ?? "Listing"
      const listingPhotos = Array.isArray(listing?.listing_photos) ? listing.listing_photos : []
      const listingThumbnail =
        listingPhotos
          .slice()
          .sort((a, b) => {
            const aIndex = typeof a.order_index === "number" ? a.order_index : Number.POSITIVE_INFINITY
            const bIndex = typeof b.order_index === "number" ? b.order_index : Number.POSITIVE_INFINITY
            return aIndex - bIndex
          })
          .map((photo) => asNonEmptyString(photo.url))
          .find(Boolean) ?? null
      const guest = Array.isArray(row.guest) ? row.guest[0] : row.guest

      return {
        id: typeof row.id === "string" ? row.id : "",
        listingId,
        listingTitle,
        listingThumbnail,
        guestName: asNonEmptyString(guest?.full_name) ?? "Guest",
        sessionDate,
        startTime,
        status: asNonEmptyString(row.status) ?? "confirmed",
        startsAtMs: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt.getTime() : Number.POSITIVE_INFINITY,
      }
    })
    .filter((booking) => booking.startsAtMs >= now.getTime())
    .sort((a, b) => a.startsAtMs - b.startsAtMs)
    .slice(0, limit)

  return normalized.map(({ startsAtMs: _startsAtMs, ...booking }) => booking)
}

async function getRecentConversations(
  userId: string,
  limit = 3
): Promise<{ items: ConversationPreview[]; unreadTotal: number }> {
  const supabase = await createClient()
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, listing_id, guest_id, host_id, last_message_at, created_at")
    .eq("host_id", userId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit)

  if (!conversations?.length) return { items: [], unreadTotal: 0 }

  const conversationIds = conversations.map((item) => item.id)
  const listingIds = Array.from(
    new Set(conversations.map((item) => (typeof item.listing_id === "string" ? item.listing_id : null)).filter(Boolean))
  ) as string[]
  const otherPartyIds = Array.from(
    new Set(conversations.map((item) => (item.guest_id === userId ? item.host_id : item.guest_id)))
  )

  const [{ data: listings }, { data: profiles }, { data: messages }] = await Promise.all([
    listingIds.length
      ? supabase.from("listings").select("id, title").in("id", listingIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string | null }> }),
    otherPartyIds.length
      ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", otherPartyIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; avatar_url: string | null }> }),
    conversationIds.length
      ? supabase
          .from("messages")
          .select("id, conversation_id, body, sender_id, created_at, read_at")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({
          data: [] as Array<{
            id: string
            conversation_id: string
            body: string | null
            sender_id: string
            created_at: string
            read_at: string | null
          }>,
        }),
  ])

  const listingMap = new Map((listings ?? []).map((row) => [row.id as string, asNonEmptyString(row.title)]))
  const profileMap = new Map(
    (profiles ?? []).map((row) => [
      row.id as string,
      {
        name: asNonEmptyString(row.full_name) ?? "Member",
        avatar: asNonEmptyString(row.avatar_url),
      },
    ])
  )

  const latestMessageByConversation = new Map<
    string,
    { body: string | null; createdAt: string | null; senderId: string | null }
  >()
  const unreadCountByConversation = new Map<string, number>()

  for (const message of messages ?? []) {
    const conversationId = message.conversation_id as string
    if (!latestMessageByConversation.has(conversationId)) {
      latestMessageByConversation.set(conversationId, {
        body: asNonEmptyString(message.body),
        createdAt: asNonEmptyString(message.created_at),
        senderId: asNonEmptyString(message.sender_id),
      })
    }
    const isUnread = !message.read_at && message.sender_id !== userId
    if (isUnread) {
      unreadCountByConversation.set(conversationId, (unreadCountByConversation.get(conversationId) ?? 0) + 1)
    }
  }

  const items = conversations.map((conversation) => {
    const otherPartyId = conversation.guest_id === userId ? conversation.host_id : conversation.guest_id
    const otherParty = profileMap.get(otherPartyId)
    const lastMessage = latestMessageByConversation.get(conversation.id)
    return {
      id: conversation.id,
      listingTitle: conversation.listing_id ? listingMap.get(conversation.listing_id) ?? null : null,
      unreadCount: unreadCountByConversation.get(conversation.id) ?? 0,
      lastMessageAt: lastMessage?.createdAt ?? asNonEmptyString(conversation.last_message_at),
      body: lastMessage?.body ?? null,
      otherPartyName: otherParty?.name ?? "Member",
      otherPartyAvatar: otherParty?.avatar ?? null,
    }
  })

  const unreadTotal = items.reduce((sum, item) => sum + item.unreadCount, 0)
  return { items, unreadTotal }
}

async function getEarningsSummary(userId: string): Promise<EarningsSummary> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("bookings")
    .select("host_payout, session_date, status")
    .eq("host_id", userId)
    .in("status", ["confirmed", "completed"])

  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()
  let thisMonth = 0
  let allTime = 0

  for (const row of data ?? []) {
    const payout = Number(row.host_payout ?? 0)
    if (!Number.isFinite(payout)) continue
    allTime += payout
    if (!row.session_date) continue
    const sessionDate = new Date(`${row.session_date}T12:00:00`)
    if (Number.isNaN(sessionDate.getTime())) continue
    if (sessionDate.getMonth() === month && sessionDate.getFullYear() === year) {
      thisMonth += payout
    }
  }

  return { thisMonth, allTime }
}

const getHostOverviewData = cache(async (userId: string): Promise<HostOverviewData> => {
  const [profile, listings, bookings, messagesResult, earnings] = await Promise.all([
    getHostProfile(userId),
    getActiveListings(userId),
    getUpcomingBookings(userId, 3),
    getRecentConversations(userId, 3),
    getEarningsSummary(userId),
  ])

  return {
    profile,
    listings,
    bookings,
    messages: messagesResult.items,
    earnings,
    unreadMessageTotal: messagesResult.unreadTotal,
  }
})

function SectionSkeleton({ heightClass = "h-24" }: { heightClass?: string }) {
  return <div className={`w-full animate-pulse rounded-xl bg-[#F0E8E0] ${heightClass}`} />
}

async function IdentityCardSection({ userId }: { userId: string }) {
  const data = await getHostOverviewData(userId)
  const activeListingsCount = data.listings.filter((listing) => listing.isActive).length
  const rating = data.profile.rating
  const showNewRating = data.profile.totalReviews === 0 || rating === null

  return (
    <section className="rounded-2xl bg-[#FAF7F4] p-4">
      <div className="flex items-center gap-4">
        <Avatar className="h-14 w-14">
          <AvatarImage src={data.profile.avatarUrl ?? undefined} alt={data.profile.name} />
          <AvatarFallback>{initialsFrom(data.profile.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-[#1A1410]">{data.profile.name}</p>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-[#6D5E51]">
            {showNewRating ? (
              <span className="rounded-full bg-[#FDEBDD] px-2 py-0.5 text-xs text-[#C75B3A]">New</span>
            ) : (
              <span>★ {rating.toFixed(1)} ({data.profile.totalReviews})</span>
            )}
            <span className="rounded-full bg-[#F0E8E0] px-2 py-0.5 text-[11px] font-medium text-[#8B4513]">Host</span>
          </div>
          <p className="mt-1 text-sm text-[#6D5E51]">
            {activeListingsCount} active listing{activeListingsCount === 1 ? "" : "s"}
          </p>
          <Link
            href={`/hosts/${userId}`}
            className="mt-1 inline-flex text-sm font-medium text-[#8B4513] hover:underline"
          >
            View host profile →
          </Link>
        </div>
      </div>
    </section>
  )
}

async function EarningsSection({ userId }: { userId: string }) {
  const data = await getHostOverviewData(userId)
  const hasEarnings = data.earnings.thisMonth > 0 || data.earnings.allTime > 0

  return (
    <section className="rounded-2xl bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#6D5E51]">This month</p>
        <p className="text-lg font-semibold text-[#1A1410]">{formatCurrency(data.earnings.thisMonth)}</p>
      </div>
      <div className="my-3 border-t border-[#F0E8E0]" />
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#6D5E51]">All time</p>
        <p className="text-lg font-semibold text-[#1A1410]">{formatCurrency(data.earnings.allTime)}</p>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-[#7A6A5D]">
          {hasEarnings ? "" : "$0 · Start earning by activating your first listing"}
        </p>
        <Link href="/dashboard/earnings" className="text-sm font-medium text-[#8B4513]">
          View details →
        </Link>
      </div>
    </section>
  )
}

async function UpcomingSection({ userId }: { userId: string }) {
  const data = await getHostOverviewData(userId)
  return (
    <section className="rounded-2xl bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-semibold text-[#1A1410]">Upcoming</h2>
        {data.bookings.length > 0 ? (
          <span className="rounded-full bg-[#F3E8DE] px-2 py-0.5 text-xs font-medium text-[#8B4513]">
            {data.bookings.length}
          </span>
        ) : null}
      </div>

      {data.bookings.length === 0 ? (
        <div className="rounded-xl border border-[#EFE6DC] bg-[#FCFAF8] p-4 text-sm text-[#6D5E51]">
          No upcoming bookings · Share your listing to get booked ✨
        </div>
      ) : (
        <div className="space-y-2">
          {data.bookings.map((booking) => (
            <Link
              key={booking.id}
              href={`/dashboard/bookings?booking=${booking.id}`}
              className="flex items-center gap-3 rounded-xl border border-[#EFE6DC] p-3"
            >
              {booking.listingThumbnail ? (
                <Image
                  src={booking.listingThumbnail}
                  alt={booking.listingTitle}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#F0E8E0] text-xs text-[#8B4513]">
                  📅
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[14px] font-semibold text-[#1A1410]">{booking.guestName}</p>
                  <p className="text-xs text-[#6D5E51]">{formatSessionDateTime(booking.sessionDate, booking.startTime)}</p>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p className="truncate text-sm text-[#6D5E51]">{booking.listingTitle}</p>
                  <span className="rounded-full bg-[#F3E8DE] px-2 py-0.5 text-[10px] font-medium capitalize text-[#8B4513]">
                    {booking.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-3">
        <Link href="/dashboard/bookings" className="text-sm font-medium text-[#8B4513]">
          View all bookings →
        </Link>
      </div>
    </section>
  )
}

async function MessagesSection({ userId }: { userId: string }) {
  const data = await getHostOverviewData(userId)
  return (
    <section className="rounded-2xl bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-semibold text-[#1A1410]">Messages</h2>
        {data.unreadMessageTotal > 0 ? (
          <span className="rounded-full bg-[#8B4513] px-2 py-0.5 text-xs font-medium text-white">
            {data.unreadMessageTotal > 99 ? "99+" : data.unreadMessageTotal}
          </span>
        ) : null}
      </div>

      {data.messages.length === 0 ? (
        <p className="text-sm text-[#6D5E51]">No messages yet</p>
      ) : (
        <div className="space-y-2">
          {data.messages.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/dashboard/messages/${conversation.id}`}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                conversation.unreadCount > 0 ? "border-[#E9D9CC] border-l-4 border-l-[#8B4513] bg-[#FFF8F2]" : "border-[#EFE6DC]"
              }`}
            >
              <Avatar size="default">
                <AvatarImage src={conversation.otherPartyAvatar ?? undefined} alt={conversation.otherPartyName} />
                <AvatarFallback>{initialsFrom(conversation.otherPartyName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${conversation.unreadCount > 0 ? "font-semibold text-[#1A1410]" : "font-medium text-[#1A1410]"}`}>
                  {conversation.otherPartyName}
                  {conversation.listingTitle ? <span className="font-normal text-[#6D5E51]"> · {conversation.listingTitle}</span> : null}
                </p>
                <p className="truncate text-xs text-[#7A6A5D]">{conversation.body ?? "No messages yet"}</p>
              </div>
              <p className="text-[11px] text-[#9A897B]">{relativeTime(conversation.lastMessageAt)}</p>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-3">
        <Link href="/dashboard/messages" className="text-sm font-medium text-[#8B4513]">
          Go to inbox →
        </Link>
      </div>
    </section>
  )
}

function QuickActionsSection() {
  const actions = [
    { href: "/dashboard/listings/new", label: "New listing", icon: Plus },
    { href: "/dashboard/listings", label: "My listings", icon: LayoutGrid },
    { href: "/dashboard/account", label: "Settings", icon: Settings },
  ]

  return (
    <section className="rounded-2xl bg-[#F7F3EE] p-0">
      <div className="grid grid-cols-3 gap-2">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-center justify-center rounded-xl border border-[#E5DDD6] bg-white p-3 text-center"
            >
              <Icon className="mb-1 size-4 text-[#8B4513]" />
              <span className="text-[13px] font-medium text-[#1A1410]">{action.label}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

async function ListingStatusSection({ userId }: { userId: string }) {
  const data = await getHostOverviewData(userId)
  if (data.listings.length === 0) {
    return (
      <section className="rounded-2xl border border-[#EADFD4] bg-white p-4">
        <p className="text-lg">🏠 List your first space</p>
        <p className="mt-1 text-sm text-[#6D5E51]">
          Start earning from your sauna, cold plunge, or wellness space.
        </p>
        <div className="mt-3">
          <Link href="/dashboard/listings/new" className="text-sm font-medium text-[#8B4513]">
            Get started →
          </Link>
        </div>
      </section>
    )
  }

  const active = data.listings.filter((listing) => listing.isActive).length
  const paused = data.listings.filter(
    (listing) =>
      !listing.isActive &&
      (listing.deactivatedReason === "paused" ||
        listing.deactivatedReason === "paused_by_host" ||
        listing.deactivatedReason === "temporarily_paused")
  ).length
  const draft = Math.max(0, data.listings.length - active - paused)

  return (
    <section className="rounded-2xl bg-white p-4">
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/listings?status=active" className="rounded-full bg-[#EFF7F1] px-3 py-1 text-xs font-medium text-[#2F7A46]">
          ● {active} active
        </Link>
        <Link href="/dashboard/listings?status=draft" className="rounded-full bg-[#F3E8DE] px-3 py-1 text-xs font-medium text-[#6D5E51]">
          ○ {draft} draft
        </Link>
        <Link href="/dashboard/listings?status=paused" className="rounded-full bg-[#F6ECE8] px-3 py-1 text-xs font-medium text-[#8A3D2E]">
          ✗ {paused} paused
        </Link>
      </div>
    </section>
  )
}

export function HostOverviewPage({ userId }: { userId: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 md:px-8 md:py-8">
      <Suspense fallback={<SectionSkeleton heightClass="h-28" />}>
        <IdentityCardSection userId={userId} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton heightClass="h-28" />}>
        <EarningsSection userId={userId} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton heightClass="h-40" />}>
        <UpcomingSection userId={userId} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton heightClass="h-36" />}>
        <MessagesSection userId={userId} />
      </Suspense>

      <QuickActionsSection />

      <Suspense fallback={<SectionSkeleton heightClass="h-20" />}>
        <ListingStatusSection userId={userId} />
      </Suspense>
    </div>
  )
}
