import { requireAdmin } from "@/lib/admin-guard"

import { PrivacyRequestsClient } from "./privacy-requests-client"

export const dynamic = "force-dynamic"

const PRIVACY_SUBJECT_PATTERN = /privacy request:|privacy|delete|ccpa|health data/i

export default async function AdminPrivacyRequestsPage() {
  const { admin } = await requireAdmin()

  const { data, error } = await admin
    .from("support_requests")
    .select(
      "id, ticket_number, name, email, subject, message, status, priority, created_at, user_id, resolution_source, resolved_at"
    )
    .or(
      "subject.ilike.%Privacy Request:%,subject.ilike.%privacy%,subject.ilike.%delete%,subject.ilike.%ccpa%,subject.ilike.%health data%"
    )
    .order("created_at", { ascending: false })
    .limit(200)

  const rows = (data ?? []).filter((row) =>
    PRIVACY_SUBJECT_PATTERN.test(typeof row.subject === "string" ? row.subject : "")
  )

  return (
    <div className="p-4 md:p-6">
      <PrivacyRequestsClient initialRows={rows} loadError={error?.message ?? null} />
    </div>
  )
}
