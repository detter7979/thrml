"use client"

import { format } from "date-fns"
import { useRouter } from "next/navigation"
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"

export type DisputeDecisionRow = {
  id: string
  support_request_id: string
  dispute_category?: string | null
  confidence?: string | null
  classification_reasoning?: string | null
  recommended_action?: string | null
  refund_amount?: number | string | null
  refund_pct?: number | string | null
  host_penalty_pct?: number | string | null
  action_taken?: string | null
  action_executed?: boolean | null
  execution_error?: string | null
  stripe_refund_id?: string | null
  created_at?: string | null
  human_review_reason?: string | null
}

export type TicketWithDecision = Record<string, unknown> & {
  latest_decision: DisputeDecisionRow | null
}

const DISPUTE_CATEGORIES = [
  "access_failure",
  "space_not_as_described",
  "guest_no_show",
  "host_no_show",
  "early_termination",
  "billing_error",
  "general_help",
  "unclear",
] as const

const OVERRIDE_ACTIONS = [
  "full_refund",
  "partial_refund",
  "no_refund",
  "host_penalty",
  "flag_for_human",
  "send_info",
  "no_action",
] as const

const STATUS_FILTERS = [
  "",
  "open",
  "pending_agent",
  "pending_human",
  "agent_resolved",
  "closed",
] as const

function categoryBadgeClass(cat: string | null | undefined) {
  switch (cat) {
    case "access_failure":
      return "bg-red-100 text-red-900 border-red-200"
    case "host_no_show":
      return "bg-orange-100 text-orange-950 border-orange-200"
    case "billing_error":
      return "bg-blue-100 text-blue-950 border-blue-200"
    case "guest_no_show":
      return "bg-stone-200 text-stone-800 border-stone-300"
    case "space_not_as_described":
      return "bg-amber-100 text-amber-950 border-amber-200"
    case "general_help":
      return "bg-sky-100 text-sky-950 border-sky-200"
    default:
      return "bg-[#E8DCCB] text-[#2A2118] border-[#DCCDBA]"
  }
}

function confidenceBadgeClass(c: string | null | undefined) {
  switch (c) {
    case "high":
      return "bg-emerald-100 text-emerald-950 border-emerald-200"
    case "medium":
      return "bg-amber-100 text-amber-950 border-amber-200"
    case "low":
      return "bg-red-100 text-red-950 border-red-200"
    default:
      return "bg-stone-100 text-stone-700 border-stone-200"
  }
}

function str(v: unknown) {
  return typeof v === "string" ? v : v != null ? String(v) : ""
}

function num(v: unknown) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

type Stats = {
  todayOpen: number
  pendingHuman: number
  autoResolvedWeek: number
  avgResolutionHours: number | null
}

type Props = {
  initialTickets: TicketWithDecision[]
  stats: Stats
  policy: Record<string, unknown> | null
}

export function DisputesDashboardClient({ initialTickets, stats, policy: initialPolicy }: Props) {
  const router = useRouter()
  const [policy, setPolicy] = useState(initialPolicy)
  const [policyDraft, setPolicyDraft] = useState(str(initialPolicy?.content))
  const [policyEditing, setPolicyEditing] = useState(false)
  const [policySaving, setPolicySaving] = useState(false)
  const [policyError, setPolicyError] = useState<string | null>(null)

  const [tableRows, setTableRows] = useState<TicketWithDecision[]>([])
  const [tableTotal, setTableTotal] = useState(0)
  const [tableLoading, setTableLoading] = useState(true)
  const [tableStatus, setTableStatus] = useState("")
  const [tableCategory, setTableCategory] = useState("")
  const [tableFrom, setTableFrom] = useState("")
  const [tableTo, setTableTo] = useState("")
  const [tableSearch, setTableSearch] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [overrideForId, setOverrideForId] = useState<string | null>(null)
  const [overrideAction, setOverrideAction] = useState<string>("partial_refund")
  const [overrideNote, setOverrideNote] = useState("")
  const [overrideRefundPct, setOverrideRefundPct] = useState("50")

  const pendingHuman = useMemo(
    () => initialTickets.filter((t) => str(t.status) === "pending_human"),
    [initialTickets]
  )

  const automationRate = useMemo(() => {
    const denom = stats.autoResolvedWeek + stats.pendingHuman
    if (denom <= 0) return null
    return Math.round((stats.autoResolvedWeek / denom) * 100)
  }, [stats.autoResolvedWeek, stats.pendingHuman])

  const refreshPolicy = useCallback(async () => {
    const res = await fetch("/api/admin/disputes/policy")
    const data = (await res.json().catch(() => ({}))) as { policy?: Record<string, unknown> | null }
    if (res.ok && data.policy) {
      setPolicy(data.policy)
      setPolicyDraft(str(data.policy.content))
    }
  }, [])

  const loadTable = useCallback(async () => {
    setTableLoading(true)
    const params = new URLSearchParams()
    params.set("limit", "80")
    params.set("offset", "0")
    if (tableStatus) params.set("status", tableStatus)
    if (tableCategory) params.set("dispute_category", tableCategory)
    if (tableFrom) params.set("from", tableFrom)
    if (tableTo) params.set("to", tableTo)
    if (tableSearch.trim()) params.set("search", tableSearch.trim())

    const res = await fetch(`/api/admin/disputes?${params.toString()}`)
    const data = (await res.json().catch(() => ({}))) as {
      tickets?: TicketWithDecision[]
      total?: number
      error?: string
    }
    if (res.ok && data.tickets) {
      setTableRows(data.tickets)
      setTableTotal(typeof data.total === "number" ? data.total : data.tickets.length)
    } else {
      setTableRows([])
      setTableTotal(0)
    }
    setTableLoading(false)
  }, [tableStatus, tableCategory, tableFrom, tableTo, tableSearch])

  useEffect(() => {
    void loadTable()
  }, [loadTable])

  async function savePolicy() {
    setPolicySaving(true)
    setPolicyError(null)
    try {
      const res = await fetch("/api/admin/disputes/policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: policyDraft }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setPolicyError(data.error ?? "Save failed")
        return
      }
      setPolicyEditing(false)
      await refreshPolicy()
    } finally {
      setPolicySaving(false)
    }
  }

  async function postResolve(
    ticketId: string,
    body: { action: string; override_action?: string; note?: string; refund_pct?: number }
  ) {
    setActionLoadingId(ticketId)
    try {
      const res = await fetch(`/api/admin/disputes/${ticketId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        alert(data.error ?? "Action failed")
        return
      }
      setOverrideForId(null)
      setOverrideNote("")
      await loadTable()
      router.refresh()
    } finally {
      setActionLoadingId(null)
    }
  }

  function startOverride(id: string) {
    setOverrideForId(id)
    setOverrideAction("partial_refund")
    setOverrideRefundPct("50")
    setOverrideNote("")
  }

  const avgLabel =
    stats.avgResolutionHours != null
      ? stats.avgResolutionHours < 24
        ? `${stats.avgResolutionHours.toFixed(1)} hrs`
        : `${(stats.avgResolutionHours / 24).toFixed(1)} days`
      : "—"

  return (
    <div className="px-4 py-8 text-[#2A2118] md:px-8">
      <header className="mb-8 border-b border-[#DCCDBA] pb-6">
        <h1 className="font-serif text-2xl lowercase tracking-tight md:text-3xl">disputes</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#6E5B49]">
          Agent classifications, human queue, and dispute policy. Changes to policy apply on the next agent run.
        </p>
      </header>

      <section className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open today" value={stats.todayOpen} />
        <StatCard label="Pending human review" value={stats.pendingHuman} highlight="amber" />
        <StatCard
          label="Auto-resolved (7 days)"
          value={stats.autoResolvedWeek}
          highlight="green"
          sub={automationRate != null ? `${automationRate}% of recent queue (auto vs human)` : undefined}
        />
        <StatCard label="Avg resolution time (7 days)" value={avgLabel} />
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-medium text-lg">Pending human review</h2>
        {pendingHuman.length === 0 ? (
          <p className="rounded-xl border border-[#DCCDBA] bg-[#F7F0E4] px-4 py-6 text-sm text-[#6E5B49]">
            No tickets awaiting review.
          </p>
        ) : (
          <div className="space-y-4">
            {pendingHuman.map((t) => (
              <article
                key={str(t.id)}
                className="rounded-xl border border-[#DCCDBA] bg-[#FDF9F3] p-4 shadow-sm md:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[#9A4A33]">
                      {str(t.ticket_number)} ·{" "}
                      {t.created_at ? format(new Date(str(t.created_at)), "MMM d, yyyy HH:mm") : "—"}
                    </p>
                    <h3 className="mt-1 font-medium">{str(t.subject)}</h3>
                    <p className="text-sm text-[#6E5B49]">
                      {str(t.name)} · {str(t.email)}
                      {t.booking_id ? ` · booking ${String(t.booking_id).slice(0, 8)}…` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${categoryBadgeClass(str(t.dispute_type) || t.latest_decision?.dispute_category)}`}
                    >
                      {str(t.dispute_type) || t.latest_decision?.dispute_category || "uncategorized"}
                    </span>
                    {t.latest_decision?.confidence ? (
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${confidenceBadgeClass(t.latest_decision.confidence)}`}
                      >
                        {t.latest_decision.confidence}
                      </span>
                    ) : null}
                  </div>
                </div>

                {t.latest_decision ? (
                  <div className="mt-4 space-y-2 text-sm">
                    <p className="text-[#5B4A3A]">
                      <span className="font-medium text-[#2A2118]">Agent reasoning: </span>
                      {t.latest_decision.classification_reasoning}
                    </p>
                    <p>
                      <span className="font-medium">Recommendation: </span>
                      {t.latest_decision.recommended_action}
                      {num(t.latest_decision.refund_amount) > 0
                        ? ` · refund $${num(t.latest_decision.refund_amount).toFixed(2)}`
                        : ""}
                    </p>
                    {t.latest_decision.human_review_reason ? (
                      <p className="text-amber-900">
                        <span className="font-medium">Human review: </span>
                        {t.latest_decision.human_review_reason}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-amber-800">No agent decision logged yet.</p>
                )}

                <p className="mt-3 line-clamp-3 rounded-lg bg-[#F3EADD] px-3 py-2 text-sm text-[#4A3C30]">
                  {str(t.message)}
                </p>

                {overrideForId === str(t.id) ? (
                  <div className="mt-4 space-y-3 rounded-lg border border-[#DCCDBA] bg-white p-4">
                    <label className="block text-xs font-medium uppercase tracking-wide text-[#6E5B49]">
                      Override action
                      <select
                        className="mt-1 w-full rounded-lg border border-[#DCCDBA] bg-[#FFFCF7] px-3 py-2 text-sm"
                        value={overrideAction}
                        onChange={(e) => setOverrideAction(e.target.value)}
                      >
                        {OVERRIDE_ACTIONS.map((a) => (
                          <option key={a} value={a}>
                            {a.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(overrideAction === "partial_refund" || overrideAction === "full_refund") && (
                      <label className="block text-xs font-medium uppercase tracking-wide text-[#6E5B49]">
                        Refund %
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="mt-1 w-full rounded-lg border border-[#DCCDBA] bg-[#FFFCF7] px-3 py-2 text-sm"
                          value={overrideRefundPct}
                          onChange={(e) => setOverrideRefundPct(e.target.value)}
                        />
                      </label>
                    )}
                    <label className="block text-xs font-medium uppercase tracking-wide text-[#6E5B49]">
                      Note (optional)
                      <textarea
                        className="mt-1 w-full rounded-lg border border-[#DCCDBA] bg-[#FFFCF7] px-3 py-2 text-sm"
                        rows={2}
                        value={overrideNote}
                        onChange={(e) => setOverrideNote(e.target.value)}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-[#2A2118] px-4 py-2 text-sm text-[#FDF9F3] disabled:opacity-50"
                        disabled={actionLoadingId === str(t.id)}
                        onClick={() =>
                          postResolve(str(t.id), {
                            action: "override",
                            override_action: overrideAction,
                            note: overrideNote || undefined,
                            refund_pct:
                              overrideAction === "partial_refund"
                                ? Number(overrideRefundPct)
                                : undefined,
                          })
                        }
                      >
                        Apply override
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-[#DCCDBA] px-4 py-2 text-sm"
                        onClick={() => setOverrideForId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-[#2A2118] px-4 py-2 text-sm text-[#FDF9F3] disabled:opacity-50"
                      disabled={actionLoadingId === str(t.id) || !t.latest_decision}
                      onClick={() => postResolve(str(t.id), { action: "approve" })}
                    >
                      Approve agent recommendation
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-[#C4A574] bg-[#F5E6C8] px-4 py-2 text-sm text-[#4A3418] disabled:opacity-50"
                      disabled={actionLoadingId === str(t.id)}
                      onClick={() => startOverride(str(t.id))}
                    >
                      Override
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-[#DCCDBA] px-4 py-2 text-sm text-[#7A2E2E] disabled:opacity-50"
                      disabled={actionLoadingId === str(t.id)}
                      onClick={() => {
                        if (confirm("Close this ticket with no resolution actions?")) {
                          void postResolve(str(t.id), { action: "reject", note: overrideNote || undefined })
                        }
                      }}
                    >
                      Reject / close
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-medium text-lg">All tickets</h2>
        <div className="mb-4 flex flex-wrap gap-3">
          <select
            className="rounded-lg border border-[#DCCDBA] bg-[#FFFCF7] px-3 py-2 text-sm"
            value={tableStatus}
            onChange={(e) => setTableStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUS_FILTERS.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-[#DCCDBA] bg-[#FFFCF7] px-3 py-2 text-sm"
            value={tableCategory}
            onChange={(e) => setTableCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {DISPUTE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="rounded-lg border border-[#DCCDBA] bg-[#FFFCF7] px-3 py-2 text-sm"
            value={tableFrom}
            onChange={(e) => setTableFrom(e.target.value)}
          />
          <input
            type="date"
            className="rounded-lg border border-[#DCCDBA] bg-[#FFFCF7] px-3 py-2 text-sm"
            value={tableTo}
            onChange={(e) => setTableTo(e.target.value)}
          />
          <input
            type="search"
            placeholder="Search ticket, email…"
            className="min-w-[200px] flex-1 rounded-lg border border-[#DCCDBA] bg-[#FFFCF7] px-3 py-2 text-sm"
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#DCCDBA] bg-[#FDF9F3]">
          <table className="w-full min-w-[880px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#DCCDBA] bg-[#F3EADD] text-xs uppercase tracking-wide text-[#6E5B49]">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Guest</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Agent action</th>
                <th className="px-3 py-2">Confidence</th>
                <th className="px-3 py-2">Refund</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">View</th>
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-[#6E5B49]">
                    Loading…
                  </td>
                </tr>
              ) : tableRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-[#6E5B49]">
                    No tickets match filters.
                  </td>
                </tr>
              ) : (
                tableRows.map((row) => {
                  const id = str(row.id)
                  const open = expandedId === id
                  const d = row.latest_decision
                  return (
                    <Fragment key={id}>
                      <tr className="border-b border-[#E8DCCB]">
                        <td className="px-3 py-2 whitespace-nowrap text-[#5B4A3A]">
                          {row.created_at
                            ? format(new Date(str(row.created_at)), "MMM d, yy")
                            : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{str(row.ticket_number)}</td>
                        <td className="px-3 py-2">{str(row.name)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${categoryBadgeClass(str(row.dispute_type) || d?.dispute_category)}`}
                          >
                            {str(row.dispute_type) || d?.dispute_category || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">{d?.recommended_action ?? "—"}</td>
                        <td className="px-3 py-2">
                          {d?.confidence ? (
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${confidenceBadgeClass(d.confidence)}`}
                            >
                              {d.confidence}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {d && num(d.refund_amount) > 0 ? `$${num(d.refund_amount).toFixed(2)}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">{str(row.status)}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="text-xs font-medium text-[#9A4A33] underline"
                            onClick={() => setExpandedId(open ? null : id)}
                          >
                            {open ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="border-b border-[#E8DCCB] bg-[#FFFCF7]">
                          <td colSpan={9} className="px-4 py-4 text-sm">
                            <p className="mb-2 font-medium text-[#2A2118]">Message</p>
                            <p className="mb-4 whitespace-pre-wrap text-[#4A3C30]">{str(row.message)}</p>
                            <p className="mb-2 font-medium text-[#2A2118]">Classification</p>
                            <p className="mb-4 text-[#5B4A3A]">{d?.classification_reasoning ?? "—"}</p>
                            <p className="mb-2 font-medium text-[#2A2118]">Execution</p>
                            <ul className="list-inside list-disc text-[#5B4A3A]">
                              <li>action_taken: {d?.action_taken ?? "—"}</li>
                              <li>action_executed: {d?.action_executed != null ? String(d.action_executed) : "—"}</li>
                              <li>execution_error: {d?.execution_error ?? "—"}</li>
                              <li>stripe_refund_id: {d?.stripe_refund_id ?? "—"}</li>
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-[#6E5B49]">Showing {tableRows.length} of {tableTotal} (paged fetch)</p>
      </section>

      <section>
        <h2 className="mb-4 font-medium text-lg">Dispute policy</h2>
        <div className="rounded-xl border border-[#DCCDBA] bg-[#FDF9F3] p-4 md:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-[#6E5B49]">
            <p>
              Version {policy?.version != null ? String(policy.version) : "—"}
              {policy?.updated_at
                ? ` · last updated ${format(new Date(str(policy.updated_at)), "MMM d, yyyy HH:mm")}`
                : ""}
            </p>
            {!policyEditing ? (
              <button
                type="button"
                className="rounded-lg border border-[#DCCDBA] bg-white px-3 py-1.5 text-sm"
                onClick={() => {
                  setPolicyDraft(str(policy?.content))
                  setPolicyEditing(true)
                  setPolicyError(null)
                }}
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-[#2A2118] px-3 py-1.5 text-sm text-[#FDF9F3] disabled:opacity-50"
                  disabled={policySaving}
                  onClick={() => void savePolicy()}
                >
                  {policySaving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[#DCCDBA] px-3 py-1.5 text-sm"
                  disabled={policySaving}
                  onClick={() => {
                    setPolicyEditing(false)
                    setPolicyDraft(str(policy?.content))
                    setPolicyError(null)
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          <p className="mb-3 text-xs text-amber-900">
            Changes take effect on the next agent run (including the hourly cron).
          </p>
          {policyError ? <p className="mb-2 text-sm text-red-700">{policyError}</p> : null}
          <textarea
            className="min-h-[280px] w-full rounded-lg border border-[#DCCDBA] bg-[#FFFCF7] p-3 font-mono text-xs leading-relaxed text-[#2A2118] disabled:opacity-80"
            readOnly={!policyEditing}
            value={policyDraft}
            onChange={(e) => setPolicyDraft(e.target.value)}
          />
        </div>
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string | number
  sub?: string
  highlight?: "green" | "amber"
}) {
  const ring =
    highlight === "green"
      ? "ring-2 ring-emerald-400/60"
      : highlight === "amber"
        ? "ring-2 ring-amber-400/50"
        : ""
  return (
    <div
      className={`rounded-xl border border-[#DCCDBA] bg-[#FDF9F3] px-4 py-4 shadow-sm ${ring}`}
    >
      <p className="text-xs uppercase tracking-wide text-[#6E5B49]">{label}</p>
      <p className="mt-1 font-serif text-2xl text-[#2A2118]">{value}</p>
      {sub ? (
        <p
          className={`mt-1 text-xs ${highlight === "green" ? "text-emerald-800" : "text-[#6E5B49]"}`}
        >
          {sub}
        </p>
      ) : null}
    </div>
  )
}
