import { requireAdmin } from "@/lib/admin-guard"

import { InboxDraftsPanel, type InboxDraftRow } from "../inbox-drafts-panel"

export const dynamic = "force-dynamic"

export default async function AdminInboxDraftsPage() {
  const { admin } = await requireAdmin()
  const { data } = await admin
    .from("inbox_drafts")
    .select("id, from_email, subject, category, draft_reply, created_at")
    .eq("approved", false)
    .is("sent_at", null)
    .order("created_at", { ascending: false })
    .limit(50)

  return <InboxDraftsPanel initialDrafts={(data ?? []) as InboxDraftRow[]} />
}
