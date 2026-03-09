"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { format, isToday, isYesterday } from "date-fns"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { createClient } from "@/lib/supabase/client"
import { MessageInput } from "./MessageInput"

type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  message_type: string
  created_at: string
  read_at: string | null
}

function dayLabel(value: string) {
  const date = new Date(value)
  if (isToday(date)) return "Today"
  if (isYesterday(date)) return "Yesterday"
  return format(date, "MMM d")
}

function isAutomated(messageType: string) {
  return messageType.startsWith("automated_")
}

export function MessageThread({
  conversationId,
  currentUserId,
}: {
  conversationId: string
  currentUserId: string
}) {
  const [conversation, setConversation] = useState<{ host_id: string } | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [otherParty, setOtherParty] = useState<{ id: string; full_name: string | null; avatar_url: string | null } | null>(null)
  const [listing, setListing] = useState<{ id: string; title: string | null } | null>(null)
  const [booking, setBooking] = useState<{
    id: string
    session_date: string | null
    start_time: string | null
    duration_hours: number | null
    access_code: string | null
  } | null>(null)
  const [typing, setTyping] = useState(false)
  const [loading, setLoading] = useState(true)
  const listRef = useRef<HTMLDivElement | null>(null)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const response = await fetch(`/api/messages/${conversationId}`)
      if (!response.ok) {
        setLoading(false)
        return
      }
      const payload = (await response.json()) as {
        conversation: { host_id: string }
        other_party: { id: string; full_name: string | null; avatar_url: string | null } | null
        listing: { id: string; title: string | null } | null
        booking: {
          id: string
          session_date: string | null
          start_time: string | null
          duration_hours: number | null
          access_code: string | null
        } | null
        messages: MessageRow[]
      }
      if (cancelled) return
      setConversation(payload.conversation)
      setOtherParty(payload.other_party)
      setListing(payload.listing)
      setBooking(payload.booking)
      setMessages(payload.messages ?? [])
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [conversationId])

  useEffect(() => {
    if (!messages.length) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
  }, [messages.length])

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => {
            const next = payload.new as MessageRow
            if (prev.some((item) => item.id === next.id)) return prev
            return [...prev, next]
          })
        }
      )
      .subscribe()

    const presence = supabase.channel(`typing:${conversationId}`, {
      config: { presence: { key: conversationId } },
    })
    presence
      .on("presence", { event: "sync" }, () => {
        const state = presence.presenceState<Record<string, unknown>>()
        const active = Object.values(state).flat().some((entry) => {
          const userId = (entry as { user_id?: string }).user_id
          const isTyping = Boolean((entry as { typing?: boolean }).typing)
          return userId && userId !== currentUserId && isTyping
        })
        setTyping(active)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(presence)
    }
  }, [conversationId, currentUserId, supabase])

  useEffect(() => {
    if (!messages.length) return
    const unread = messages.some((item) => item.sender_id !== currentUserId && !item.read_at)
    if (!unread) return
    void fetch(`/api/messages/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_read" }),
    })
  }, [conversationId, currentUserId, messages])

  const otherName = otherParty?.full_name ?? "Member"
  const initials = otherName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <section className="flex h-[calc(100vh-130px)] flex-col">
      <header className="border-b border-[#E7DED3] bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar size="default">
              <AvatarImage src={otherParty?.avatar_url ?? undefined} alt={otherName} />
              <AvatarFallback>{initials || "M"}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-[#1A1410]">{otherName}</p>
              <Link
                href={booking?.id ? `/dashboard/bookings` : "#"}
                className="text-xs text-[#7A6A5D] underline-offset-2 hover:underline"
              >
                Booking: {booking?.session_date ?? "Date TBD"} · {listing?.title ?? "Listing"}
              </Link>
            </div>
          </div>
          {conversation?.host_id === currentUserId ? (
            <Link
              href="/dashboard/host/templates"
              className="shrink-0 rounded-full border border-[#E5DDD6] px-3 py-1.5 text-xs font-medium text-[#5A4B40] transition-colors hover:bg-[#FAF6F1]"
            >
              Message templates
            </Link>
          ) : null}
        </div>
        <p className="mt-3 rounded-md border border-[#E6DDD3] bg-[#FCF8F3] px-3 py-2 text-xs text-[#6C5B4F]">
          Thrml never asks you to pay outside the platform. Report any requests to do so.
        </p>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-[#F7F3EE] px-4 py-4">
        {loading ? <p className="text-sm text-[#7A6A5D]">Loading messages...</p> : null}
        {messages.map((message, index) => {
          const dateBreak =
            index === 0 ||
            dayLabel(messages[index - 1].created_at) !== dayLabel(message.created_at)
          const own = message.sender_id === currentUserId
          const automated = isAutomated(message.message_type)

          return (
            <div key={message.id}>
              {dateBreak ? (
                <div className="my-2 text-center text-[11px] text-[#8E7E71]">{dayLabel(message.created_at)}</div>
              ) : null}
              {automated ? (
                <div className="mx-auto max-w-lg rounded-xl bg-[#ECEAE6] px-3 py-2 text-center text-xs text-[#6D6056] italic">
                  Automated message: {message.body}
                  <div className="mt-1 text-[10px] not-italic text-[#97897D]">
                    {format(new Date(message.created_at), "h:mm a")}
                  </div>
                </div>
              ) : (
                <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%]`}>
                    <div
                      className={`rounded-2xl px-3 py-2 text-sm ${
                        own
                          ? "bg-[#C75B3A] text-white"
                          : "border border-[#E5DCCF] bg-white text-[#1A1410]"
                      }`}
                    >
                      {message.body}
                    </div>
                    <div
                      className={`mt-1 text-[11px] text-[#8E7E71] ${
                        own ? "text-right" : "text-left"
                      }`}
                    >
                      {format(new Date(message.created_at), "h:mm a")}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {typing ? <p className="text-xs text-[#8C7B6E]">{otherName} is typing...</p> : null}
      </div>

      <MessageInput
        conversationId={conversationId}
        currentUserId={currentUserId}
        otherPartyName={otherName.split(" ")[0] || "there"}
        isHost={conversation?.host_id === currentUserId}
        bookingContext={booking}
        onSend={(message) => {
          setMessages((prev) => (prev.some((item) => item.id === message.id) ? prev : [...prev, message]))
        }}
      />
    </section>
  )
}
