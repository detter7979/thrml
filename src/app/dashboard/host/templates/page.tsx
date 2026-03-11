import { redirect } from "next/navigation"

import { TemplateEditor } from "@/components/messaging/TemplateEditor"
import { createClient } from "@/lib/supabase/server"

export default async function HostTemplatesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login?next=/dashboard/host/templates")
  const [{ count: listingCount }, { data: profile }] = await Promise.all([
    supabase.from("listings").select("*", { count: "exact", head: true }).eq("host_id", user.id).eq("is_active", true),
    supabase.from("profiles").select("ui_intent").eq("id", user.id).maybeSingle(),
  ])
  const canManageTemplates =
    Boolean((listingCount ?? 0) > 0) || profile?.ui_intent === "host" || profile?.ui_intent === "both"
  if (!canManageTemplates) redirect("/dashboard/messages")

  return <TemplateEditor />
}
