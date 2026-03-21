import { requireAdmin } from "@/lib/admin-guard"

import { AdminAnalyticsClient, type AnalyticsRow } from "./analytics-client"

export const dynamic = "force-dynamic"

function mapAnalyticsRow(row: Record<string, unknown>): AnalyticsRow {
  return {
    id: String(row.id ?? ""),
    date: typeof row.date === "string" ? row.date : String(row.date ?? ""),
    channel: String(row.channel ?? ""),
    campaign_id: String(row.campaign_id ?? ""),
    campaign_name: String(row.campaign_name ?? ""),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    spend: Number(row.spend ?? 0),
    sessions: Number(row.sessions ?? 0),
    view_listing: Number(row.view_listing ?? 0),
    begin_checkout: Number(row.begin_checkout ?? 0),
    purchases: Number(row.purchases ?? 0),
    revenue: Number(row.revenue ?? 0),
    bookings_count: Number(row.bookings_count ?? 0),
    ctr: Number(row.ctr ?? 0),
    cvr_session_to_purchase: Number(row.cvr_session_to_purchase ?? 0),
    cvr_checkout_to_purchase: Number(row.cvr_checkout_to_purchase ?? 0),
    cpa: Number(row.cpa ?? 0),
    roas: Number(row.roas ?? 0),
  }
}

export default async function AdminAnalyticsPage() {
  const { admin } = await requireAdmin()

  const { data: rows } = await admin
    .from("analytics_daily")
    .select("*")
    .order("date", { ascending: false })
    .limit(500)

  const initialRows = (rows ?? []).map((row) => mapAnalyticsRow(row as Record<string, unknown>))

  return <AdminAnalyticsClient initialRows={initialRows} />
}
