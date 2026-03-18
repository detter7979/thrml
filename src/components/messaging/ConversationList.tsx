"use client"

import Link from "next/link"
import { formatDistanceToNowStrict } from "date-fns"
import { Search } from "lucide-react"
import { useMemo, useState } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

export type ConversationItem = {
  id: string
  listing_title: string | null
  booking_date: string | null
  unread_count: number
  last_message_at: string | null
  last_message: {
    body: string
  } | null
  other_party: {
    full_name: string | null
    avatar_url: string | null
  } | null
}

function previewText(value: string | null | undefined) {
  if (!value) return "No messages yet"
  return value.length > 40 ? `${value.slice(0, 40)}...` : value
}

function relative(value: string | null) {
  if (!value) return ""
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""
  return `${formatDistanceToNowStrict(parsed, { addSuffix: true })}`
}

export function ConversationList({
  conversations,
  activeConversationId,
  showTemplatesLink = false,
  onOpenConversation,
}: {
  conversations: ConversationItem[]
  activeConversationId: string | null
  showTemplatesLink?: boolean
  onOpenConversation?: (conversationId: string, unreadCount: number) => void
}) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const pageSize = 12
  const filteredConversations = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return conversations
    return conversations.filter((conversation) =>
      [
        conversation.other_party?.full_name ?? "",
        conversation.listing_title ?? "",
        conversation.last_message?.body ?? "",
      ].some((value) => value.toLowerCase().includes(normalized))
    )
  }, [conversations, query])
  const pageCount = Math.max(1, Math.ceil(filteredConversations.length / pageSize))
  const pageItems = filteredConversations.slice((page - 1) * pageSize, page * pageSize)

  return (
    <aside className="border-r border-[#E7DED3] bg-white">
      <div className="border-b border-[#F1E7DC] px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-serif text-3xl text-[#1A1410]">Messages</h1>
          {showTemplatesLink ? (
            <Link
              href="/dashboard/host/templates"
              className="rounded-full border border-[#E5DDD6] px-3 py-1.5 text-xs font-medium text-[#5A4B40] transition-colors hover:bg-[#FAF6F1]"
            >
              Message templates
            </Link>
          ) : null}
        </div>
        <label className="relative mt-3 block">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-[#9A897B]" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder="Search conversations..."
            className="w-full rounded-full border border-[#E5DDD6] py-2 pr-3 pl-9 text-sm text-[#1A1410]"
          />
        </label>
      </div>
      <div className="max-h-[calc(100dvh-180px)] overflow-y-auto">
        {pageItems.length ? (
          pageItems.map((conversation) => {
            const name = conversation.other_party?.full_name ?? "Member"
            const initials = name
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()
            const active = activeConversationId === conversation.id

            return (
              <Link
                key={conversation.id}
                href={`/dashboard/messages/${conversation.id}`}
                onClick={() => onOpenConversation?.(conversation.id, conversation.unread_count)}
                className={cn(
                  "relative flex items-center gap-3 border-l-4 px-4 py-3 transition-colors",
                  active
                    ? "border-l-[#C75B3A] bg-[#FFF7F1]"
                    : "border-l-transparent hover:bg-[#FBF7F2]"
                )}
              >
                <Avatar size="default">
                  <AvatarImage src={conversation.other_party?.avatar_url ?? undefined} alt={name} />
                  <AvatarFallback>{initials || "M"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#1A1410]">
                    {name}
                    {conversation.listing_title ? (
                      <span className="ml-1 font-normal text-[#7A6A5D]">· {conversation.listing_title}</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-[#7A6A5D]">{previewText(conversation.last_message?.body)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[11px] text-[#9A897B]">{relative(conversation.last_message_at)}</span>
                  {conversation.unread_count > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-[#C75B3A]">
                      <span className="size-2 rounded-full bg-[#C75B3A]" />
                    </span>
                  ) : null}
                </div>
              </Link>
            )
          })
        ) : (
          <div className="px-4 py-10 text-center text-sm text-[#7A6A5D]">No conversations yet.</div>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-[#F1E7DC] px-4 py-2 text-xs text-[#7A6A5D]">
        <button
          type="button"
          className="rounded-full border border-[#E5DDD6] px-3 py-1 hover:bg-[#FAF6F1] disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          Prev
        </button>
        <span>
          Page {page} / {pageCount}
        </span>
        <button
          type="button"
          className="rounded-full border border-[#E5DDD6] px-3 py-1 hover:bg-[#FAF6F1] disabled:opacity-40"
          disabled={page >= pageCount}
          onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
        >
          Next
        </button>
      </div>
    </aside>
  )
}
