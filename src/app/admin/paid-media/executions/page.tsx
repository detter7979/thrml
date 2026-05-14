import Link from "next/link"

import { requireAdmin } from "@/lib/admin-guard"
import type { MetaExecutionRow, MetaExecutionStatusT } from "@/types/paid-media"

import { MetaAgentRunButtons } from "./executions-client"

export const dynamic = "force-dynamic"

function statusBadge(status: MetaExecutionStatusT) {
  const map: Record<MetaExecutionStatusT, string> = {
    pending: "bg-[#E8E0D4] text-[#5B4A3A]",
    in_progress: "bg-amber-100 text-amber-900",
    success: "bg-emerald-100 text-emerald-900",
    failed: "bg-red-100 text-red-900",
    retrying: "bg-sky-100 text-sky-900",
  }
  return map[status] ?? "bg-gray-100 text-gray-800"
}

export default async function PaidMediaExecutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { admin } = await requireAdmin()
  const q = await searchParams
  const filter = (q.filter ?? "all").toLowerCase()

  const sinceDate = new Date()
  sinceDate.setUTCMinutes(sinceDate.getUTCMinutes() - 24 * 60)
  const since = sinceDate.toISOString()

  const [total24, ok24, fail24, retry24, execRes] = await Promise.all([
    admin.from("meta_executions").select("id", { count: "exact", head: true }).gte("started_at", since),
    admin.from("meta_executions").select("id", { count: "exact", head: true }).gte("started_at", since).eq("status", "success"),
    admin.from("meta_executions").select("id", { count: "exact", head: true }).gte("started_at", since).eq("status", "failed"),
    admin.from("meta_executions").select("id", { count: "exact", head: true }).gte("started_at", since).eq("status", "retrying"),
    admin
      .from("meta_executions")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50),
  ])

  const rows = (execRes.data ?? []) as MetaExecutionRow[]
  const campaignIds = [...new Set(rows.map((r) => r.target_campaign_id).filter(Boolean))] as string[]
  const legacyByCampaign = new Map<string, string | null>()
  if (campaignIds.length > 0) {
    const { data: camps } = await admin.from("campaigns").select("id, legacy_id").in("id", campaignIds)
    for (const c of camps ?? []) {
      legacyByCampaign.set(c.id as string, (c.legacy_id as string | null) ?? null)
    }
  }

  const filtered =
    filter === "success"
      ? rows.filter((r) => r.status === "success")
      : filter === "failed"
        ? rows.filter((r) => r.status === "failed")
        : filter === "retrying"
          ? rows.filter((r) => r.status === "retrying")
          : rows

  const chip = (label: string, value: string) => {
    const active = filter === value || (value === "all" && filter === "all")
    return (
      <Link
        href={value === "all" ? "/admin/paid-media/executions" : `/admin/paid-media/executions?filter=${value}`}
        className={`rounded-full border px-3 py-1 text-xs font-medium ${
          active
            ? "border-[#9A4A33] bg-[#F7EFE4] text-[#9A4A33]"
            : "border-[#DCCDBA] bg-[#FCF8F3] text-[#5B4A3A] hover:border-[#9A4A33]/40"
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <div className="space-y-6 px-4 py-6 md:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-serif text-2xl lowercase tracking-tight text-[#2A2118] md:text-3xl">executions</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#5B4A3A]">
            Meta Marketing API runs for approved recommendations. Retries and idempotency live in{" "}
            <code className="rounded bg-[#EDE3D4] px-1 text-xs">meta_executions</code>.
          </p>
        </div>
        <MetaAgentRunButtons />
      </div>

      <div className="flex flex-wrap gap-4 rounded-xl border border-[#DCCDBA] bg-[#FCF8F3] p-4 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-[#6E5B49]">24h total</p>
          <p className="text-lg font-semibold text-[#2A2118]">{total24.count ?? 0}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-[#6E5B49]">Success</p>
          <p className="text-lg font-semibold text-emerald-800">{ok24.count ?? 0}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-[#6E5B49]">Failed</p>
          <p className="text-lg font-semibold text-red-800">{fail24.count ?? 0}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-[#6E5B49]">Retrying</p>
          <p className="text-lg font-semibold text-sky-900">{retry24.count ?? 0}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {chip("All", "all")}
        {chip("Success", "success")}
        {chip("Failed", "failed")}
        {chip("Retrying", "retrying")}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#DCCDBA] bg-[#FCF8F3]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[#E7DACA] bg-[#F7EFE4] text-xs uppercase tracking-wide text-[#6E5B49]">
            <tr>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">Campaign</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Attempt</th>
              <th className="px-3 py-2">HTTP</th>
              <th className="px-3 py-2">Error</th>
              <th className="px-3 py-2">Payload</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-[#6E5B49]">
                  No executions in this view.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const legacy = r.target_campaign_id ? legacyByCampaign.get(r.target_campaign_id) : null
                const err = r.error_message ? (r.error_message.length > 80 ? `${r.error_message.slice(0, 80)}…` : r.error_message) : "—"
                return (
                  <tr key={r.id} className="border-b border-[#EDE3D4] last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[#5B4A3A]">
                      {new Date(r.started_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-[#2A2118]">{r.kind}</td>
                    <td className="px-3 py-2 text-xs text-[#5B4A3A]">{legacy ?? r.meta_campaign_id ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.attempt}</td>
                    <td className="px-3 py-2 text-xs">{r.http_status ?? "—"}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-xs text-[#6E5B49]" title={r.error_message ?? ""}>
                      {err}
                    </td>
                    <td className="px-3 py-2">
                      <details className="text-xs">
                        <summary className="cursor-pointer text-[#9A4A33]">JSON</summary>
                        <pre className="mt-2 max-h-48 max-w-md overflow-auto rounded bg-[#2A2118] p-2 text-[10px] text-[#E8E0D4]">
                          {JSON.stringify({ request: r.request_payload, response: r.response_payload }, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
