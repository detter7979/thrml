import Link from "next/link"
import Image from "next/image"
import { MessageCircle } from "lucide-react"

import { GuestHostCta } from "@/components/dashboard/GuestHostCta"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  PUBLIC_PROFILE_NAME_AVATAR_COLUMNS,
  PUBLIC_PROFILES_TABLE,
} from "@/lib/supabase/public-profiles"
import { createClient } from "@/lib/supabase/server"

type GuestOverviewPageProps = {
  userId: string
  canHost: boolean
}

type NextSession = {
  id: string
  title: string
  when: string
  photo: string | null
}

type MessagePreview = {
  id: string
  name: string
  avatar: string | null
  body: string | null
  unread: number
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "M"
}

function formatWhen(sessionDate: string | null, startTime: string | null) {
  if (!sessionDate) return "Date to be confirmed"
  const base = new Date(`${sessionDate}T${startTime ?? "12:00:00"}`)
  if (Number.isNaN(base.getTime())) return "Date to be confirmed"
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(base)
}

async function getNextSession(userId: string): Promise<NextSession | null> {
  const supabase = await createClient()
  const today = new Date()
  const localDateIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const { data } = await supabase
    .from("bookings")
    .select(`
      id,
      session_date,
      start_time,
      listing:listings(title, listing_photos(url, order_index))
    `)
    .eq("guest_id", userId)
    .eq("status", "confirmed")
    .gte("session_date", localDateIso)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!data || typeof data.id !== "string") return null
  const listing = Array.isArray(data.listing) ? data.listing[0] : data.listing
  const photos = Array.isArray(listing?.listing_photos) ? listing.listing_photos : []
  const photo =
    photos
      .slice()
      .sort((a, b) => {
        const aIndex = typeof a.order_index === "number" ? a.order_index : Number.POSITIVE_INFINITY
        const bIndex = typeof b.order_index === "number" ? b.order_index : Number.POSITIVE_INFINITY
        return aIndex - bIndex
      })
      .map((item) => asText(item.url))
      .find(Boolean) ?? null

  return {
    id: data.id,
    title: asText(listing?.title) ?? "Your session",
    when: formatWhen(asText(data.session_date), asText(data.start_time)),
    photo,
  }
}

async function getMessagePreviews(userId: string): Promise<MessagePreview[]> {
  const supabase = await createClient()
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, host_id, last_message_at")
    .eq("guest_id", userId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(3)

  if (!conversations?.length) return []
  const ids = conversations.map((row) => row.id)
  const hostIds = conversations.map((row) => row.host_id).filter((id): id is string => typeof id === "string")
  const [{ data: profiles }, { data: messages }] = await Promise.all([
    hostIds.length
      ? supabase.from(PUBLIC_PROFILES_TABLE).select(PUBLIC_PROFILE_NAME_AVATAR_COLUMNS).in("id", hostIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; avatar_url: string | null }> }),
    supabase
      .from("messages")
      .select("conversation_id, body, sender_id, created_at, read_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false }),
  ])
  const names = new Map(
    (profiles ?? []).map((row) => [
      row.id,
      { name: asText(row.full_name) ?? "Host", avatar: asText(row.avatar_url) },
    ])
  )
  const latest = new Map<string, { body: string | null; unread: number }>()
  for (const message of messages ?? []) {
    const conversationId = message.conversation_id as string
    const current = latest.get(conversationId) ?? { body: null, unread: 0 }
    if (!current.body) current.body = asText(message.body)
    if (!message.read_at && message.sender_id !== userId) current.unread += 1
    latest.set(conversationId, current)
  }

  return conversations.map((conversation) => {
    const host = typeof conversation.host_id === "string" ? names.get(conversation.host_id) : undefined
    const preview = latest.get(conversation.id)
    return {
      id: conversation.id,
      name: host?.name ?? "Host",
      avatar: host?.avatar ?? null,
      body: preview?.body ?? null,
      unread: preview?.unread ?? 0,
    }
  })
}

export async function GuestOverviewPage({ userId, canHost }: GuestOverviewPageProps) {
  const [nextSession, messages] = await Promise.all([getNextSession(userId), getMessagePreviews(userId)])
  const unread = messages.reduce((sum, message) => sum + message.unread, 0)

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 md:px-8 md:py-8">
      <section>
        <p className="text-[13px] font-medium tracking-[0.16em] text-[#C75B3A] uppercase">Your visits</p>
        <h1 className="mt-1 font-serif text-4xl text-[#1A1410]">Welcome back</h1>
      </section>

      <Link href="/dashboard/bookings" className="block overflow-hidden rounded-3xl bg-white">
        {nextSession?.photo ? (
          <div className="relative aspect-[16/8]">
            <Image src={nextSession.photo} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 720px" />
          </div>
        ) : null}
        <div className="p-4">
          <p className="text-xs font-medium tracking-[0.14em] text-[#8B4513] uppercase">Next session</p>
          {nextSession ? (
            <>
              <p className="mt-1 font-serif text-2xl text-[#1A1410]">{nextSession.title}</p>
              <p className="mt-1 text-sm text-[#6D5E51]">{nextSession.when}</p>
            </>
          ) : (
            <>
              <p className="mt-1 font-serif text-2xl text-[#1A1410]">Nothing booked yet</p>
              <p className="mt-1 text-sm text-[#6D5E51]">Explore is where the spaces live.</p>
            </>
          )}
        </div>
      </Link>

      <section className="overflow-hidden rounded-3xl bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="size-4 text-[#8B4513]" />
            <h2 className="text-base font-semibold text-[#1A1410]">Messages</h2>
            {unread > 0 ? (
              <span className="rounded-full bg-[#C75B3A] px-2 py-0.5 text-xs font-medium text-white">{unread}</span>
            ) : null}
          </div>
          <Link href="/dashboard/messages" className="text-sm font-medium text-[#8B4513]">
            Inbox
          </Link>
        </div>
        {messages.length === 0 ? (
          <p className="border-t border-[#F0E8E0] px-4 py-4 text-sm text-[#6D5E51]">
            Hosts reply here after you book.
          </p>
        ) : (
          messages.map((message) => (
            <Link
              key={message.id}
              href={`/dashboard/messages/${message.id}`}
              className="flex items-center gap-3 border-t border-[#F0E8E0] px-4 py-3"
            >
              <Avatar>
                <AvatarImage src={message.avatar ?? undefined} alt={message.name} />
                <AvatarFallback>{initials(message.name)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[#1A1410]">{message.name}</span>
                <span className="block truncate text-xs text-[#7A6A5D]">{message.body ?? "No messages yet"}</span>
              </span>
            </Link>
          ))
        )}
      </section>

      <Link href="/dashboard/saved" className="block rounded-3xl bg-white px-4 py-4">
        <p className="text-sm font-medium text-[#1A1410]">Wishlists</p>
        <p className="mt-1 text-sm text-[#6D5E51]">Spaces you saved for later.</p>
      </Link>

      <Link href="/dashboard/account#profile" className="block rounded-3xl bg-white px-4 py-4">
        <p className="text-sm font-medium text-[#1A1410]">Profile</p>
        <p className="mt-1 text-sm text-[#6D5E51]">Name, photo, phone, and how we reach you.</p>
      </Link>

      {canHost ? null : <GuestHostCta />}
    </div>
  )
}
