import { redirect } from "next/navigation"

import { MessagesInboxClient } from "@/components/messaging/MessagesInboxClient"
import { createClient } from "@/lib/supabase/server"

type Params = {
  conversationId: string
}

export default async function DashboardConversationPage({ params }: { params: Promise<Params> }) {
  const { conversationId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=/dashboard/messages/${conversationId}`)

  return <MessagesInboxClient currentUserId={user.id} activeConversationId={conversationId} />
}
