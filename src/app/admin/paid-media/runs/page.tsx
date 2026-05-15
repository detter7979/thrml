import { requireAdmin } from "@/lib/admin-guard"

import { PayloadCell, RunsToolbar } from "./runs-client"

export const dynamic = "force-dynamic"

type ActionsLogRow = {
  id: string
  executed_at: string
  success: boolean
  error_message: string | null
  payload: Record<string, unknown> | null
}

export default async function PaidMediaReportingRunsPage() {
  const { admin } = await requireAdmin()

  const { data: runs, error } = await admin
    .from("actions_log")
    .select("id, executed_at, success, error_message, payload")
    .eq("executed_by", "REPORTING_AGENT")
    .in("kind", ["AGENT_RUN", "SYSTEM"])
    .order("executed_at", { ascending: false })
    .limit(50)

  const rows = (runs ?? []) as ActionsLogRow[]

  return (
    <div className="space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-[#2A2118]">Reporting runs</h1>
          <p className="text-sm text-[#6E5B49]">Meta performance ingest via REPORTING_AGENT.</p>
        </div>
        <RunsToolbar />
      </div>

      {error ? (
        <div className="rounded-2xl border border-[#C75B3A]/40 bg-[#F9E5DD] px-4 py-3 text-sm text-[#2A2118]">
          Could not load runs: {error.message}
        </div>
      ) : null}

      {rows.length === 0 && !error ? (
        <p className="rounded-2xl border border-[#DCCDBA] bg-[#FCFAF7] px-4 py-6 text-sm text-[#5B4A3A]">
          No runs yet. The agent runs daily at 09:05 UTC.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-[#DCCDBA] bg-white">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#EDE8E2] bg-[#F5F0EA] text-left text-xs font-semibold uppercase tracking-wide text-[#6E5B49]">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Error</th>
                <th className="px-4 py-3">Rows / duration / payload</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = row.success ? "✓" : "✗"
                const ts = new Date(row.executed_at).toLocaleString("en-US", {
                  timeZone: "UTC",
                  dateStyle: "medium",
                  timeStyle: "short",
                })
                return (
                  <tr key={row.id} className="border-b border-[#EDE8E2] last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-[#2A2118]">{ts} UTC</td>
                    <td className="px-4 py-3">
                      <span className={row.success ? "text-[#2D6A4F]" : "text-[#C0392B]"}>
                        {status} {row.success ? "success" : "failed"}
                      </span>
                    </td>
                    <td className="max-w-md px-4 py-3 align-top text-xs text-[#5B4A3A]">
                      {row.success ? (
                        "—"
                      ) : row.error_message ? (
                        <span className="line-clamp-4 whitespace-pre-wrap text-[#C0392B]" title={row.error_message}>
                          {row.error_message}
                        </span>
                      ) : (
                        <span className="text-[#A08E7A]">No message</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <PayloadCell row={row} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
