import { redirect } from "next/navigation"

import { requireAdmin } from "@/lib/admin-guard"

export const dynamic = "force-dynamic"

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; conversationId?: string; view?: string }>
}) {
  await requireAdmin()
  const query = await searchParams
  const q = new URLSearchParams()
  if (typeof query.userId === "string" && query.userId.length > 0) {
    q.set("userId", query.userId)
  }
  if (typeof query.conversationId === "string" && query.conversationId.length > 0) {
    q.set("conversationId", query.conversationId)
  }
  if (query.view === "support") {
    q.set("view", "support")
  }
  const s = q.toString()
  redirect(s ? `/admin/inbox/messages?${s}` : "/admin/inbox/messages")
}
