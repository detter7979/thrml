import { requireAdmin } from "@/lib/admin-guard"
import { AdminOverviewClient } from "./overview-client"

export const dynamic = "force-dynamic"

export default async function AdminOverviewPage() {
  const { admin } = await requireAdmin()

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const todayIso = now.toISOString().slice(0, 10)

  const [
    { count: totalBookings },
    { count: bookingsLast30 },
    { count: activeListings },
    { count: totalUsers },
    { count: pendingHost },
    { count: todaySessions },
    { data: revenueData },
  ] = await Promise.all([
    admin.from("bookings").select("id", { count: "exact", head: true }),
    admin.from("bookings").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
    admin
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("is_deleted", false),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending_host"),
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("session_date", todayIso)
      .in("status", ["confirmed", "pending"]),
    admin.from("bookings").select("total_charged, service_fee").in("status", ["confirmed", "completed"]),
  ])

  const gmv = (revenueData ?? []).reduce((sum, row) => sum + Number(row.total_charged ?? 0), 0)
  const fees = (revenueData ?? []).reduce((sum, row) => sum + Number(row.service_fee ?? 0), 0)

  const fourteenDaysAgoIso = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const [{ data: recentBookings }, { data: recentProfiles }, { data: recentMessages }, supportQuery] =
    await Promise.all([
      admin
        .from("bookings")
        .select("id, created_at, total_charged")
        .gte("created_at", fourteenDaysAgoIso)
        .order("created_at", { ascending: true }),
      admin
        .from("profiles")
        .select("id, created_at, ui_intent")
        .gte("created_at", fourteenDaysAgoIso)
        .order("created_at", { ascending: true }),
      admin
        .from("messages")
        .select("id, body, created_at")
        .order("created_at", { ascending: false })
        .limit(6),
      admin
        .from("support_requests")
        .select("id, ticket_number, subject, priority, created_at")
        .order("created_at", { ascending: false })
        .limit(6),
    ])

  const dailyMap = new Map<
    string,
    { label: string; bookings: number; gmv: number; users: number; hosts: number }
  >()
  for (let i = 13; i >= 0; i -= 1) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const key = date.toISOString().slice(0, 10)
    dailyMap.set(key, {
      label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      bookings: 0,
      gmv: 0,
      users: 0,
      hosts: 0,
    })
  }

  for (const row of recentBookings ?? []) {
    const key = typeof row.created_at === "string" ? row.created_at.slice(0, 10) : null
    if (!key || !dailyMap.has(key)) continue
    const point = dailyMap.get(key)!
    point.bookings += 1
    point.gmv += Number(row.total_charged ?? 0)
  }

  for (const row of recentProfiles ?? []) {
    const key = typeof row.created_at === "string" ? row.created_at.slice(0, 10) : null
    if (!key || !dailyMap.has(key)) continue
    const point = dailyMap.get(key)!
    point.users += 1
    const intent = typeof row.ui_intent === "string" ? row.ui_intent : "guest"
    if (intent === "host" || intent === "both") point.hosts += 1
  }

  const messagePreviews = (recentMessages ?? []).map((row) => ({
    id: String(row.id),
    title: "Conversation activity",
    subtitle:
      typeof row.body === "string" && row.body.length > 100
        ? `${row.body.slice(0, 100)}...`
        : (row.body ?? "New message"),
    timestamp: typeof row.created_at === "string" ? new Date(row.created_at).toLocaleString() : "Unknown time",
  }))

  const supportPreviews = (supportQuery.error ? [] : supportQuery.data ?? []).map((row) => ({
    id: String(row.id),
    title: `${row.ticket_number ?? "Ticket"} · ${row.subject ?? "Support request"}`,
    subtitle: `Priority: ${row.priority ?? "normal"}`,
    timestamp: typeof row.created_at === "string" ? new Date(row.created_at).toLocaleString() : "Unknown time",
  }))

  return (
    <AdminOverviewClient
      stats={{
        totalBookings: totalBookings ?? 0,
        bookingsLast30: bookingsLast30 ?? 0,
        grossGmv: gmv,
        platformFees: fees,
        activeListings: activeListings ?? 0,
        totalUsers: totalUsers ?? 0,
        pendingHost: pendingHost ?? 0,
        todaySessions: todaySessions ?? 0,
      }}
      dailySeries={Array.from(dailyMap.values())}
      messagePreviews={messagePreviews}
      supportPreviews={supportPreviews}
    />
  )
}
