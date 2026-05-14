"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"

type Proposal = {
  kind: string
  target: { campaignId?: string; adSetId?: string; adId?: string }
  payload: Record<string, unknown>
  evidence: Record<string, unknown>
  rationale: string
  confidence: number
}

export function EvaluatorDryRunClient() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<{
    proposals_raw: number
    proposals_after_dedupe: number
    duration_ms: number
    runId: string | null
  } | null>(null)
  const [proposals, setProposals] = useState<Proposal[] | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    setProposals(null)
    setMeta(null)
    try {
      const res = await fetch("/api/cron/evaluator-agent/dry-run", { method: "POST", credentials: "include" })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        proposals?: Proposal[]
        proposals_raw?: number
        proposals_after_dedupe?: number
        proposals_written?: number
        duration_ms?: number
        runId?: string | null
      }
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`)
        return
      }
      setMeta({
        proposals_raw: data.proposals_raw ?? 0,
        proposals_after_dedupe: data.proposals_after_dedupe ?? 0,
        duration_ms: data.duration_ms ?? 0,
        runId: data.runId ?? null,
      })
      setProposals(data.proposals ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        disabled={loading}
        onClick={() => void run()}
        className="bg-[#9A4A33] text-white hover:bg-[#823A2A]"
      >
        {loading ? "Running…" : "Run dry-run now"}
      </Button>
      {error ? (
        <div className="rounded-2xl border border-[#C75B3A]/40 bg-[#F9E5DD] px-4 py-3 text-sm text-[#2A2118]">{error}</div>
      ) : null}
      {meta ? (
        <p className="text-sm text-[#6E5B49]">
          Run <span className="font-mono text-xs">{meta.runId}</span> — raw {meta.proposals_raw}, after dedupe + floor +
          cap {meta.proposals_after_dedupe}, {meta.duration_ms}ms (nothing written to recommendations).
        </p>
      ) : null}
      {proposals && proposals.length === 0 ? (
        <p className="text-sm text-[#6E5B49]">No proposals at current thresholds / data.</p>
      ) : null}
      {proposals && proposals.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3]">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#E7DACA] text-xs uppercase tracking-wide text-[#6E5B49]">
                <th className="px-3 py-2">kind</th>
                <th className="px-3 py-2">confidence</th>
                <th className="px-3 py-2">target</th>
                <th className="px-3 py-2">rationale</th>
                <th className="px-3 py-2">payload</th>
                <th className="px-3 py-2">evidence</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p, i) => (
                <tr key={i} className="border-b border-[#E7DACA] align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{p.kind}</td>
                  <td className="whitespace-nowrap px-3 py-2">{p.confidence.toFixed(2)}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-[#5B4A3A]">
                    {p.target.campaignId ? `${p.target.campaignId.slice(0, 8)}…` : "—"}
                    {p.target.adSetId ? (
                      <>
                        <br />
                        set {p.target.adSetId.slice(0, 8)}…
                      </>
                    ) : null}
                    {p.target.adId ? (
                      <>
                        <br />
                        ad {p.target.adId.slice(0, 8)}…
                      </>
                    ) : null}
                  </td>
                  <td className="max-w-md px-3 py-2 text-[#2A2118]">{p.rationale}</td>
                  <td className="max-w-xs truncate px-3 py-2 font-mono text-[11px] text-[#6E5B49]">
                    {JSON.stringify(p.payload)}
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 font-mono text-[11px] text-[#6E5B49]">
                    {JSON.stringify(p.evidence)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
