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

  const [{ count: listingCount }, { data: profile }] = await Promise.all([
    supabase.from("listings").select("*", { count: "exact", head: true }).eq("host_id", user.id).eq("is_active", true),
    supabase.from("profiles").select("ui_intent").eq("id", user.id).maybeSingle(),
  ])
  const canManageTemplates =
    Boolean((listingCount ?? 0) > 0) || profile?.ui_intent === "host" || profile?.ui_intent === "both"

  return (
    <MessagesInboxClient
      currentUserId={user.id}
      activeConversationId={conversationId}
      canManageTemplates={canManageTemplates}
    />
  )
}
