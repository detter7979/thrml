import { redirect } from "next/navigation"

import { TemplateEditor } from "@/components/messaging/TemplateEditor"
import { createClient } from "@/lib/supabase/server"

export default async function HostTemplatesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login?next=/dashboard/host/templates")

  return <TemplateEditor />
}
