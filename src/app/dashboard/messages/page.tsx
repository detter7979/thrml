import { redirect } from "next/navigation"

import { MessagesInboxClient } from "@/components/messaging/MessagesInboxClient"
import { createClient } from "@/lib/supabase/server"

export default async function DashboardMessagesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login?next=/dashboard/messages")

  return <MessagesInboxClient currentUserId={user.id} activeConversationId={null} />
}
