import { redirect } from "next/navigation"

import { resolveAdminConversation } from "@/lib/admin/conversations"
import { requireAdmin } from "@/lib/admin-guard"

import { AdminMessagesHub } from "@/app/admin/messages/admin-messages-hub"

export const dynamic = "force-dynamic"

export default async function AdminInboxMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; conversationId?: string; view?: string }>
}) {
  const { user, admin } = await requireAdmin()
  const query = await searchParams
  const initialView = query.view === "support" ? "support" : "messages"

  let activeConversationId =
    typeof query.conversationId === "string" && query.conversationId.length > 0
      ? query.conversationId
      : null

  if (!activeConversationId && typeof query.userId === "string" && query.userId.length > 0) {
    const result = await resolveAdminConversation(admin, user.id, query.userId)
    if (result.ok) {
      const params = new URLSearchParams()
      params.set("conversationId", result.conversationId)
      if (initialView === "support") params.set("view", "support")
      redirect(`/admin/inbox/messages?${params.toString()}`)
    }
  }

  return (
    <AdminMessagesHub
      currentUserId={user.id}
      activeConversationId={activeConversationId}
      initialView={initialView}
    />
  )
}
