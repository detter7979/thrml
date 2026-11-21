import { requireAdmin } from "@/lib/admin-guard"

import { ReportsClient, type ReportRow } from "./reports-client"

export const dynamic = "force-dynamic"

export default async function AdminReportsPage() {
  const { admin } = await requireAdmin()

  const { data, error } = await admin
    .from("content_reports")
    .select(
      "id, target_type, target_id, reported_user_id, reporter_id, conversation_id, reason, details, status, admin_note, created_at, resolved_at"
    )
    .order("created_at", { ascending: false })
    .limit(200)

  const reports = data ?? []
  const userIds = [...new Set(reports.flatMap((r) => [r.reporter_id, r.reported_user_id]).filter(Boolean))] as string[]
  const listingIds = reports.filter((r) => r.target_type === "listing").map((r) => r.target_id)
  const reviewIds = reports.filter((r) => r.target_type === "review").map((r) => r.target_id)
  const messageIds = reports.filter((r) => r.target_type === "message").map((r) => r.target_id)

  const [profiles, listings, reviews, messages] = await Promise.all([
    userIds.length ? admin.from("profiles").select("id, full_name").in("id", userIds) : { data: [] },
    listingIds.length ? admin.from("listings").select("id, title, is_active").in("id", listingIds) : { data: [] },
    reviewIds.length
      ? admin.from("reviews").select("id, comment, listing_id, is_published").in("id", reviewIds)
      : { data: [] },
    messageIds.length ? admin.from("messages").select("id, body, conversation_id").in("id", messageIds) : { data: [] },
  ])

  const nameById = new Map((profiles.data ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? "Unnamed"]))
  const listingById = new Map((listings.data ?? []).map((l) => [l.id as string, l]))
  const reviewById = new Map((reviews.data ?? []).map((r) => [r.id as string, r]))
  const messageById = new Map((messages.data ?? []).map((m) => [m.id as string, m]))

  const rows: ReportRow[] = reports.map((r) => {
    let preview = ""
    let href: string | null = null
    let live = true
    if (r.target_type === "listing") {
      const listing = listingById.get(r.target_id)
      preview = (listing?.title as string | undefined) ?? "Listing"
      href = `/listings/${r.target_id}`
      live = Boolean(listing?.is_active)
    } else if (r.target_type === "review") {
      const review = reviewById.get(r.target_id)
      preview = (review?.comment as string | undefined) ?? "Review"
      href = review?.listing_id ? `/listings/${review.listing_id}#reviews` : null
      live = Boolean(review?.is_published)
    } else if (r.target_type === "message") {
      const message = messageById.get(r.target_id)
      preview = (message?.body as string | undefined) ?? "Message"
      href = message?.conversation_id ? `/admin/messages?conversationId=${message.conversation_id}` : null
    } else {
      preview = nameById.get(r.target_id) ?? "Person"
      href = r.conversation_id ? `/admin/messages?conversationId=${r.conversation_id}` : null
    }
    return {
      id: r.id,
      targetType: r.target_type,
      reason: r.reason,
      details: r.details,
      status: r.status,
      adminNote: r.admin_note,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      reporterName: nameById.get(r.reporter_id) ?? "Unknown",
      reportedUserId: r.reported_user_id,
      reportedName: r.reported_user_id ? nameById.get(r.reported_user_id) ?? "Unknown" : "Unknown",
      preview,
      href,
      live,
    }
  })

  return (
    <div className="p-4 md:p-6">
      <ReportsClient initialRows={rows} loadError={error?.message ?? null} />
    </div>
  )
}
