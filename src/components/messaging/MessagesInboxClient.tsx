"use client"

import { useEffect, useState } from "react"

import { ConversationList, type ConversationItem } from "@/components/messaging/ConversationList"
import { MessageThread } from "@/components/messaging/MessageThread"
import { createClient } from "@/lib/supabase/client"

export function MessagesInboxClient({
  currentUserId,
  activeConversationId,
  canManageTemplates,
}: {
  currentUserId: string
  activeConversationId: string | null
  canManageTemplates: boolean
}) {
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [loading, setLoading] = useState(true)

  async function loadConversations() {
    setLoading(true)
    try {
      const response = await fetch("/api/conversations")
      if (!response.ok) return
      const payload = (await response.json()) as { conversations: ConversationItem[] }
      setConversations(payload.conversations ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadConversations()
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const messagesChannel = supabase
      .channel(`dashboard-messages-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        void loadConversations()
      })
      .subscribe()

    const conversationsChannel = supabase
      .channel(`dashboard-conversations-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        void loadConversations()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(messagesChannel)
      supabase.removeChannel(conversationsChannel)
    }
  }, [currentUserId])

  const selectedId = activeConversationId ?? conversations[0]?.id ?? null

  async function handleOpenConversation(conversationId: string, unreadCount: number) {
    if (unreadCount <= 0) return

    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              unread_count: 0,
            }
          : conversation
      )
    )

    const response = await fetch(`/api/messages/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_read" }),
    })

    if (response.ok) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("dashboard:messages-unread-decrement", {
            detail: { amount: unreadCount },
          })
        )
      }
      await loadConversations()
      return
    }

    await loadConversations()
  }

  return (
    <div className="grid min-h-[calc(100vh-80px)] grid-cols-1 md:grid-cols-[360px_1fr]">
      <ConversationList
        conversations={conversations}
        activeConversationId={selectedId}
        showTemplatesLink={canManageTemplates}
        onOpenConversation={handleOpenConversation}
      />
      <div className="bg-[#F7F3EE]">
        {!loading && selectedId ? (
          <MessageThread
            conversationId={selectedId}
            currentUserId={currentUserId}
            canManageTemplates={canManageTemplates}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[#7A6A5D]">
            {loading ? "Loading conversations..." : "Select a conversation to start messaging."}
          </div>
        )}
      </div>
    </div>
  )
}
