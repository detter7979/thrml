"use client"

import Link from "next/link"
import { formatDistanceToNowStrict } from "date-fns"

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
      </div>
      <div className="max-h-[calc(100vh-180px)] overflow-y-auto">
        {conversations.length ? (
          conversations.map((conversation) => {
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
    </aside>
  )
}
