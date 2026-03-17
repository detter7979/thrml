import { NextResponse } from "next/server"
import { z } from "zod"

import { applyMemoryRateLimit, requestIp } from "@/lib/security"
import { createClient } from "@/lib/supabase/server"

type ConversationPayload = {
  id: string
  booking_id: string
  listing_id: string
  guest_id: string
  host_id: string
  last_message_at: string | null
  created_at: string
  other_party: {
    id: string
    full_name: string | null
    avatar_url: string | null
  } | null
  listing_title: string | null
  booking_date: string | null
  last_message: {
    id: string
    body: string
    sender_id: string
    created_at: string
    message_type: string
  } | null
  unread_count: number
}

const createConversationSchema = z.object({
  bookingId: z.string().uuid(),
})

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: conversationsRaw, error: conversationsError } = await supabase
    .from("conversations")
    .select("id, booking_id, listing_id, guest_id, host_id, last_message_at, created_at")
    .or(`guest_id.eq.${user.id},host_id.eq.${user.id}`)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (conversationsError) {
    return NextResponse.json({ error: conversationsError.message }, { status: 500 })
  }

  const conversations = (conversationsRaw ?? []) as Array<{
    id: string
    booking_id: string
    listing_id: string
    guest_id: string
    host_id: string
    last_message_at: string | null
    created_at: string
  }>

  if (!conversations.length) return NextResponse.json({ conversations: [] as ConversationPayload[] })

  const conversationIds = conversations.map((item) => item.id)
  const listingIds = Array.from(new Set(conversations.map((item) => item.listing_id)))
  const bookingIds = Array.from(new Set(conversations.map((item) => item.booking_id)))
  const otherPartyIds = Array.from(
    new Set(
      conversations.map((item) => (item.guest_id === user.id ? item.host_id : item.guest_id))
    )
  )

  const [{ data: listings }, { data: bookings }, { data: profiles }, { data: messages }] = await Promise.all([
    supabase.from("listings").select("id, title").in("id", listingIds),
    supabase.from("bookings").select("id, session_date").in("id", bookingIds),
    supabase.from("profiles").select("id, full_name, avatar_url").in("id", otherPartyIds),
    supabase
      .from("messages")
      .select("id, conversation_id, sender_id, body, message_type, created_at, read_at")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false }),
  ])

  const listingMap = new Map((listings ?? []).map((row) => [row.id as string, row.title as string | null]))
  const bookingDateMap = new Map((bookings ?? []).map((row) => [row.id as string, row.session_date as string | null]))
  const profileMap = new Map(
    (profiles ?? []).map((row) => [
      row.id as string,
      {
        id: row.id as string,
        full_name: row.full_name as string | null,
        avatar_url: row.avatar_url as string | null,
      },
    ])
  )

  const lastMessageByConversation = new Map<string, NonNullable<ConversationPayload["last_message"]>>()
  const unreadCountByConversation = new Map<string, number>()

  for (const row of messages ?? []) {
    const conversationId = row.conversation_id as string
    if (!lastMessageByConversation.has(conversationId)) {
      lastMessageByConversation.set(conversationId, {
        id: row.id as string,
        body: row.body as string,
        sender_id: row.sender_id as string,
        created_at: row.created_at as string,
        message_type: (row.message_type as string) ?? "text",
      })
    }
    const unread = !row.read_at && row.sender_id !== user.id
    if (unread) {
      unreadCountByConversation.set(
        conversationId,
        (unreadCountByConversation.get(conversationId) ?? 0) + 1
      )
    }
  }

  const payload: ConversationPayload[] = conversations
    .map((conversation) => {
      const otherPartyId = conversation.guest_id === user.id ? conversation.host_id : conversation.guest_id
      const lastMessage = lastMessageByConversation.get(conversation.id) ?? null
      const sortAt = lastMessage?.created_at ?? conversation.last_message_at ?? conversation.created_at
      return {
        id: conversation.id,
        booking_id: conversation.booking_id,
        listing_id: conversation.listing_id,
        guest_id: conversation.guest_id,
        host_id: conversation.host_id,
        last_message_at: sortAt,
        created_at: conversation.created_at,
        other_party: profileMap.get(otherPartyId) ?? null,
        listing_title: listingMap.get(conversation.listing_id) ?? null,
        booking_date: bookingDateMap.get(conversation.booking_id) ?? null,
        last_message: lastMessage,
        unread_count: unreadCountByConversation.get(conversation.id) ?? 0,
      }
    })
    .sort((a, b) => {
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
      return bTime - aTime
    })

  return NextResponse.json({ conversations: payload })
}

export async function POST(req: Request) {
  const ip = requestIp(req)
  const limit = await applyMemoryRateLimit({
    key: `api:conversations:create:${ip}`,
    max: 20,
    windowMs: 60_000,
  })
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = createConversationSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 })
  const bookingId = parsed.data.bookingId

  const { data: existing } = await supabase
    .from("conversations")
    .select("id, guest_id, host_id")
    .eq("booking_id", bookingId)
    .maybeSingle()

  if (existing) {
    if (existing.guest_id !== user.id && existing.host_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json({ conversation: existing })
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, listing_id, guest_id, host_id")
    .eq("id", bookingId)
    .maybeSingle()

  if (bookingError) return NextResponse.json({ error: bookingError.message }, { status: 500 })
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  if (booking.guest_id !== user.id && booking.host_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      booking_id: booking.id,
      listing_id: booking.listing_id,
      guest_id: booking.guest_id,
      host_id: booking.host_id,
      last_message_at: new Date().toISOString(),
    })
    .select("id, guest_id, host_id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ conversation: data }, { status: 201 })
}
