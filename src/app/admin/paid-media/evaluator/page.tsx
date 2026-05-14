import Link from "next/link"

import { requireAdmin } from "@/lib/admin-guard"

import { EvaluatorDryRunClient } from "./evaluator-dry-run-client"

export const dynamic = "force-dynamic"

type RunRow = {
  id: string
  executed_at: string
  success: boolean
  error_message: string | null
  payload: Record<string, unknown> | null
}

export default async function PaidMediaEvaluatorPage() {
  const { admin } = await requireAdmin()

  const { data: runs, error } = await admin
    .from("actions_log")
    .select("id, executed_at, success, error_message, payload")
    .eq("executed_by", "EVALUATOR_AGENT")
    .order("executed_at", { ascending: false })
    .limit(20)

  const rows = (runs ?? []) as RunRow[]

  return (
    <div className="space-y-8 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-[#2A2118]">Paid media · Evaluator</h1>
          <p className="mt-1 text-sm text-[#6E5B49]">
            Deterministic rules engine (no LLM). Cron writes PENDING recommendations for human approval.
          </p>
        </div>
        <Link
          href="/admin/paid-media"
          className="rounded-full border border-[#CDBCA8] bg-white px-3 py-1.5 text-sm text-[#2A2118] hover:bg-[#F3EADD]"
        >
          Approval queue
        </Link>
      </div>

      <section className="rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3] p-6">
        <h2 className="font-serif text-xl text-[#2A2118]">Dry-run</h2>
        <p className="mt-2 text-sm text-[#6E5B49]">
          Preview proposals with the same dedupe, confidence floor, and cap as production — no rows inserted into{" "}
          <code className="font-mono text-xs">recommendations</code>. An <code className="font-mono text-xs">actions_log</code>{" "}
          row is still recorded for audit.
        </p>
        <div className="mt-4">
          <EvaluatorDryRunClient />
        </div>
      </section>

      <section>
        <h2 className="font-serif text-xl text-[#2A2118]">Last evaluator runs</h2>
        {error ? (
          <div className="mt-3 rounded-2xl border border-[#C75B3A]/40 bg-[#F9E5DD] px-4 py-3 text-sm text-[#2A2118]">
            Could not load runs: {error.message}
          </div>
        ) : null}
        {!error && rows.length === 0 ? (
          <p className="mt-3 text-sm text-[#6E5B49]">No evaluator runs yet.</p>
        ) : null}
        {rows.length > 0 ? (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-[#DCCDBA] bg-white">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#EDE8E2] bg-[#F5F0EA] text-left text-xs font-semibold uppercase tracking-wide text-[#6E5B49]">
                  <th className="px-4 py-3">UTC time</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payload summary</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const ts = new Date(row.executed_at).toLocaleString("en-US", {
                    timeZone: "UTC",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                  const p = row.payload ?? {}
                  return (
                    <tr key={row.id} className="border-b border-[#EDE8E2] align-top last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-[#2A2118]">{ts} UTC</td>
                      <td className="px-4 py-3">
                        <span className={row.success ? "text-[#2D6A4F]" : "text-[#C0392B]"}>
                          {row.success ? "✓" : "✗"} {row.error_message ? row.error_message.slice(0, 80) : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[#5B4A3A]">
                        dry_run={String(p.dry_run)} raw={String(p.proposals_generated ?? "")} dedupe=
                        {String(p.proposals_after_dedupe ?? "")} written={String(p.proposals_written ?? "")}{" "}
                        {p.duration_ms != null ? `${p.duration_ms}ms` : ""}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <p className="text-sm text-[#6E5B49]">
        Production cron: <code className="font-mono text-xs">GET /api/cron/evaluator-agent</code> with{" "}
        <code className="font-mono text-xs">x-cron-secret</code> or Bearer <code className="font-mono text-xs">CRON_SECRET</code>.
      </p>
    </div>
  )
}
