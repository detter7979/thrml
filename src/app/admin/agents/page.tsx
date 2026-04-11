"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

type AgentRun = {
  id: string; agent_name: string; status: string; started_at: string
  completed_at: string | null; duration_ms: number | null
  results: Record<string, unknown> | null; error_message: string | null
}
type OpsAlert = {
  id: string; severity: string; category: string; message: string
  resolved: boolean; created_at: string
}
type FinanceSnap = {
  snapshot_date: string; booking_count: number; gross_booking_value: number
  platform_revenue: number; net_platform_revenue: number; new_users: number
}
type QueueItem = {
  id: string; queue_type: string; platform: string; concept: string | null
  copy_suggestion: string | null; hook_suggestion: string | null
  status: string; approved_at: string | null; created_at: string
}
type InboxDraft = {
  id: string; from_email: string; subject: string | null; category: string
  draft_reply: string | null; approved: boolean; created_at: string
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const STATUS_COLOR: Record<string, string> = {
  success: "text-green-600", error: "text-red-500", running: "text-yellow-500",
  skipped: "text-gray-400", CRITICAL: "text-red-500", WARNING: "text-orange-500", INFO: "text-blue-500",
}
const SEVERITY_BG: Record<string, string> = {
  CRITICAL: "bg-red-50 border-red-200", WARNING: "bg-orange-50 border-orange-200", INFO: "bg-blue-50 border-blue-100",
}

export default function AgentsDashboard() {
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [alerts, setAlerts] = useState<OpsAlert[]>([])
  const [finance, setFinance] = useState<FinanceSnap[]>([])
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [drafts, setDrafts] = useState<InboxDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"overview"|"queue"|"inbox"|"finance">("overview")

  const load = useCallback(async () => {
    const sb = createClient()
    const [r1, r2, r3, r4, r5] = await Promise.all([
      sb.from("agent_runs").select("*").order("started_at", { ascending: false }).limit(30),
      sb.from("ops_alerts").select("*").eq("resolved", false).order("created_at", { ascending: false }).limit(20),
      sb.from("finance_snapshots").select("*").order("snapshot_date", { ascending: false }).limit(14),
      sb.from("creative_queue").select("*").eq("status", "PENDING").order("created_at", { ascending: false }).limit(20),
      sb.from("inbox_drafts").select("*").eq("approved", false).is("sent_at", null).order("created_at", { ascending: false }).limit(20),
    ])
    setRuns((r1.data ?? []) as AgentRun[])
    setAlerts((r2.data ?? []) as OpsAlert[])
    setFinance((r3.data ?? []) as FinanceSnap[])
    setQueue((r4.data ?? []) as QueueItem[])
    setDrafts((r5.data ?? []) as InboxDraft[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const resolveAlert = async (id: string) => {
    const sb = createClient()
    await sb.from("ops_alerts").update({ resolved: true, resolved_at: new Date().toISOString() }).eq("id", id)
    setAlerts(a => a.filter(x => x.id !== id))
  }

  const approveQueueItem = async (id: string) => {
    const sb = createClient()
    await sb.from("creative_queue").update({ approved_at: new Date().toISOString(), approved_by: "dom" }).eq("id", id)
    setQueue(q => q.filter(x => x.id !== id))
  }

  const approveDraft = async (id: string) => {
    const sb = createClient()
    await sb.from("inbox_drafts").update({ approved: true, approved_at: new Date().toISOString() }).eq("id", id)
    setDrafts(d => d.filter(x => x.id !== id))
  }

  const criticalCount = alerts.filter(a => a.severity === "CRITICAL").length
  const latestFinance = finance[0]

  const TABS = [
    { key: "overview", label: `Overview${criticalCount > 0 ? ` 🚨${criticalCount}` : ""}` },
    { key: "queue", label: `Content Queue${queue.length > 0 ? ` (${queue.length})` : ""}` },
    { key: "inbox", label: `Inbox Drafts${drafts.length > 0 ? ` (${drafts.length})` : ""}` },
    { key: "finance", label: "Finance" },
  ] as const

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading agent dashboard...</div>

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agent Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">thrml autonomous agent system</p>
        </div>
        <button onClick={load} className="text-sm px-3 py-1.5 border rounded-md hover:bg-muted">↻ Refresh</button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Yesterday Revenue", value: latestFinance ? fmt(latestFinance.net_platform_revenue) : "—" },
          { label: "Open Alerts", value: String(alerts.length), danger: criticalCount > 0 },
          { label: "Content Pending", value: String(queue.length) },
          { label: "Inbox Drafts", value: String(drafts.length) },
        ].map(s => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.danger ? "text-red-500" : ""}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Ops Alerts */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Ops Alerts ({alerts.length})
            </h2>
            {alerts.length === 0 ? (
              <p className="text-sm text-green-600">✅ No open alerts — all systems healthy.</p>
            ) : (
              <div className="space-y-2">
                {alerts.map(a => (
                  <div key={a.id} className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${SEVERITY_BG[a.severity] ?? ""}`}>
                    <div className="flex-1 min-w-0">
                      <span className={`font-semibold text-xs ${STATUS_COLOR[a.severity]}`}>{a.severity}</span>
                      <span className="mx-2 text-muted-foreground text-xs">[{a.category}]</span>
                      <span>{a.message}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
                    </div>
                    <button onClick={() => resolveAlert(a.id)}
                      className="shrink-0 text-xs px-2 py-1 border rounded hover:bg-white">
                      Resolve
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Agent Runs */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Recent Agent Runs</h2>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {["Agent", "Status", "Duration", "Started", "Summary"].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => (
                    <tr key={r.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                      <td className="px-3 py-2 font-mono text-xs">{r.agent_name}</td>
                      <td className={`px-3 py-2 font-medium text-xs ${STATUS_COLOR[r.status] ?? ""}`}>{r.status}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{timeAgo(r.started_at)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-xs">
                        {r.error_message ?? JSON.stringify(r.results ?? {}).slice(0, 80)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* CONTENT QUEUE TAB */}
      {tab === "queue" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Social + ad content generated by agents. Review and approve to schedule.</p>
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending content.</p>
          ) : queue.map(item => (
            <div key={item.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{item.queue_type}</span>
                  <span className="text-xs text-muted-foreground">{item.platform}</span>
                  {item.concept && <span className="text-xs text-muted-foreground">· {item.concept}</span>}
                  <span className="text-xs text-muted-foreground">· {timeAgo(item.created_at)}</span>
                </div>
                <button onClick={() => approveQueueItem(item.id)}
                  className="shrink-0 text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">
                  ✓ Approve
                </button>
              </div>
              {item.hook_suggestion && (
                <p className="text-xs font-medium text-foreground">Hook: {item.hook_suggestion}</p>
              )}
              {item.copy_suggestion && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{item.copy_suggestion}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* INBOX DRAFTS TAB */}
      {tab === "inbox" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Email replies drafted by the inbox agent. Approve to mark as ready to send.</p>
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending inbox drafts.</p>
          ) : drafts.map(d => (
            <div key={d.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{d.subject ?? "(no subject)"}</p>
                  <p className="text-xs text-muted-foreground">{d.from_email} · {d.category} · {timeAgo(d.created_at)}</p>
                </div>
                <button onClick={() => approveDraft(d.id)}
                  className="shrink-0 text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">
                  ✓ Approve
                </button>
              </div>
              {d.draft_reply && (
                <div className="bg-muted/50 rounded p-3">
                  <p className="text-xs text-muted-foreground mb-1">Draft reply:</p>
                  <p className="text-sm whitespace-pre-wrap">{d.draft_reply}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* FINANCE TAB */}
      {tab === "finance" && (
        <div className="space-y-4">
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {["Date", "Bookings", "Gross", "Platform Rev", "Net Rev", "New Users"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {finance.map((f, i) => (
                  <tr key={f.snapshot_date} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    <td className="px-3 py-2 text-xs font-mono">{f.snapshot_date}</td>
                    <td className="px-3 py-2 text-xs">{f.booking_count}</td>
                    <td className="px-3 py-2 text-xs">{fmt(f.gross_booking_value)}</td>
                    <td className="px-3 py-2 text-xs">{fmt(f.platform_revenue)}</td>
                    <td className="px-3 py-2 text-xs font-medium">{fmt(f.net_platform_revenue)}</td>
                    <td className="px-3 py-2 text-xs">{f.new_users}</td>
                  </tr>
                ))}
                {finance.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-4 text-xs text-muted-foreground text-center">
                    No finance snapshots yet — runs after the first agent-finance cron.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
