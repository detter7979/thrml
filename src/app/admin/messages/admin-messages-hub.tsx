"use client"

import { useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { MessagesInboxClient } from "@/components/messaging/MessagesInboxClient"
import { SupportTicketsPanel } from "./support-tickets-panel"

type AdminMessagesHubProps = {
  currentUserId: string
  activeConversationId: string | null
  initialView: "messages" | "support"
}

export function AdminMessagesHub({
  currentUserId,
  activeConversationId,
  initialView,
}: AdminMessagesHubProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [view, setView] = useState<"messages" | "support">(initialView)

  const conversationId = useMemo(() => {
    if (view !== "messages") return null
    return activeConversationId
  }, [activeConversationId, view])

  function setViewAndUrl(next: "messages" | "support") {
    setView(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next === "support") {
      params.set("view", "support")
      params.delete("conversationId")
    } else {
      params.delete("view")
    }
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <section className="space-y-4 px-4 py-4 md:px-6 md:py-6">
      <div className="inline-flex items-center gap-1 rounded-lg border border-[#D9CBB8] bg-[#FCF8F3] p-1">
        <button
          type="button"
          onClick={() => setViewAndUrl("messages")}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            view === "messages"
              ? "bg-[#2A2118] text-white"
              : "text-[#5B4A3A] hover:bg-[#F3EADD]"
          }`}
        >
          Messages
        </button>
        <button
          type="button"
          onClick={() => setViewAndUrl("support")}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            view === "support"
              ? "bg-[#2A2118] text-white"
              : "text-[#5B4A3A] hover:bg-[#F3EADD]"
          }`}
        >
          Support tickets
        </button>
      </div>

      {view === "messages" ? (
        <MessagesInboxClient
          currentUserId={currentUserId}
          activeConversationId={conversationId}
          canManageTemplates={false}
        />
      ) : (
        <SupportTicketsPanel />
      )}
    </section>
  )
}
