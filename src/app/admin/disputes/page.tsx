import { requireAdmin } from "@/lib/admin-guard"

import { DisputesDashboardClient, type DisputeDecisionRow, type TicketWithDecision } from "./disputes-client"

export const dynamic = "force-dynamic"

function latestDecisionMap(rows: DisputeDecisionRow[]) {
  const map = new Map<string, DisputeDecisionRow>()
  for (const row of rows) {
    const sid = row.support_request_id
    if (!sid) continue
    const existing = map.get(sid)
    if (!existing) {
      map.set(sid, row)
      continue
    }
    const a = existing.created_at ?? ""
    const b = row.created_at ?? ""
    if (b > a) map.set(sid, row)
  }
  return map
}

export default async function AdminDisputesPage() {
  const { admin } = await requireAdmin()

  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setUTCHours(0, 0, 0, 0)
  const weekAgoIso = new Date(now.getTime() - 7 * 86400000).toISOString()

  const policyRes = await admin
    .from("agent_policies")
    .select("*")
    .eq("policy_key", "dispute_resolution_v1")
    .eq("is_active", true)
    .maybeSingle()

  const [todayOpenRes, pendingHumanRes, autoResolvedRes, activeTicketsRes, avgSampleRes] =
    await Promise.all([
      admin
        .from("support_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .gte("created_at", startOfToday.toISOString()),
      admin
        .from("support_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_human"),
      admin
        .from("support_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "agent_resolved")
        .gte("resolved_at", weekAgoIso),
      admin
        .from("support_requests")
        .select("*")
        .in("status", ["open", "pending_agent", "pending_human"])
        .order("created_at", { ascending: false })
        .limit(400),
      admin
        .from("support_requests")
        .select("created_at, resolved_at")
        .eq("status", "agent_resolved")
        .gte("resolved_at", weekAgoIso)
        .not("resolved_at", "is", null)
        .limit(400),
    ])

  const activeTickets = (activeTicketsRes.data ?? []) as Record<string, unknown>[]
  const ids = activeTickets.map((t) => t.id as string).filter(Boolean)

  let decisionRows: DisputeDecisionRow[] = []
  if (ids.length > 0) {
    const decRes = await admin
      .from("dispute_decisions")
      .select("*")
      .in("support_request_id", ids)
      .order("created_at", { ascending: false })
    decisionRows = (decRes.data ?? []) as DisputeDecisionRow[]
  }

  const decMap = latestDecisionMap(decisionRows)
  const ticketsWithDecisions: TicketWithDecision[] = activeTickets.map((t) => ({
    ...t,
    latest_decision: decMap.get(t.id as string) ?? null,
  }))

  const resolvedSamples = (avgSampleRes.data ?? []) as { created_at?: string; resolved_at?: string }[]
  let avgResolutionHours: number | null = null
  if (resolvedSamples.length > 0) {
    const hours: number[] = []
    for (const r of resolvedSamples) {
      const c = r.created_at ? new Date(r.created_at).getTime() : 0
      const rsv = r.resolved_at ? new Date(r.resolved_at).getTime() : 0
      if (rsv > c) hours.push((rsv - c) / 3600000)
    }
    if (hours.length > 0) {
      avgResolutionHours = hours.reduce((a, b) => a + b, 0) / hours.length
    }
  }

  const stats = {
    todayOpen: todayOpenRes.count ?? 0,
    pendingHuman: pendingHumanRes.count ?? 0,
    autoResolvedWeek: autoResolvedRes.count ?? 0,
    avgResolutionHours,
  }

  return (
    <DisputesDashboardClient
      initialTickets={ticketsWithDecisions}
      stats={stats}
      policy={(policyRes.data as Record<string, unknown> | null) ?? null}
    />
  )
}
