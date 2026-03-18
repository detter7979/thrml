import { requireAdmin } from "@/lib/admin-guard"
import { AdminMessagesHub } from "./admin-messages-hub"

export const dynamic = "force-dynamic"

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; conversationId?: string; view?: string }>
}) {
  const { user } = await requireAdmin()
  const query = await searchParams
  const activeConversationId =
    typeof query.conversationId === "string" && query.conversationId.length > 0
      ? query.conversationId
      : null
  const initialView = query.view === "support" ? "support" : "messages"

  return (
    <AdminMessagesHub
      currentUserId={user.id}
      activeConversationId={activeConversationId}
      initialView={initialView}
    />
  )
}
