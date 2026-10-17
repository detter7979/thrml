"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"

type Proposal = {
  kind: string
  rationale: string
  confidence: number
  campaign?: string
  ad_set?: string
  ad?: string
}

type Result = {
  ok: boolean
  error?: string
  campaigns?: string[]
  days?: number
  spend?: number
  rawProposals?: number
  scenarios?: string[]
  proposals?: Proposal[]
  sentToApprovals?: number
  report?: { rows: number; sheets: string[]; errors: string[] } | null
  recommendations?: number
}

const TEST_SHEET = "https://docs.google.com/spreadsheets/d/1RXVCTClJHg5YAY7l4i0sidnyt7ywb9g3vPmA0a2c138/edit"

export function TestScenarioClient() {
  const [busy, setBusy] = useState<string | null>(null)
  const [res, setRes] = useState<Result | null>(null)

  const call = async (body: Record<string, unknown>, label: string) => {
    setBusy(label)
    try {
      const r = await fetch("/api/admin/reporting/test-scenario", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await r.json()) as Result
      setRes(r.ok ? data : { ok: false, error: data.error ?? `HTTP ${r.status}` })
    } catch (e) {
      setRes({ ok: false, error: e instanceof Error ? e.message : "Request failed" })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void call({ action: "run" }, "run")}
          className="bg-[#9A4A33] text-white hover:bg-[#823A2A]"
        >
          {busy === "run" ? "Running…" : "Run test scenario"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={Boolean(busy)}
          onClick={() => void call({ action: "run", sendToApprovals: true }, "send")}
        >
          {busy === "send" ? "Running…" : "Run and send to Approvals"}
        </Button>
        <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void call({ action: "clear" }, "clear")}>
          {busy === "clear" ? "Clearing…" : "Clear test data"}
        </Button>
        <a href={TEST_SHEET} target="_blank" rel="noreferrer" className="self-center text-sm font-medium text-[#9A4A33] hover:underline">
          Open test report →
        </a>
      </div>

      {res && !res.ok ? (
        <div className="rounded-2xl border border-[#C75B3A]/40 bg-[#F9E5DD] px-4 py-3 text-sm text-[#2A2118]">{res.error}</div>
      ) : null}

      {res?.ok && res.recommendations !== undefined && !res.proposals ? (
        <p className="text-sm text-[#6E5B49]">Cleared test report rows and {res.recommendations} test recommendation(s).</p>
      ) : null}

      {res?.ok && res.proposals ? (
        <div className="space-y-3">
          <p className="text-sm text-[#6E5B49]">
            {res.days} days of fake data on {res.campaigns?.join(", ")} (${res.spend?.toLocaleString()} spend).{" "}
            {res.rawProposals} raw proposals → {res.proposals.length} after dedupe, confidence floor and cap.
            {res.sentToApprovals ? ` Sent ${res.sentToApprovals} to Approvals, marked [TEST].` : ""}
            {res.report ? ` Test report: ${res.report.rows} rows → ${res.report.sheets.join(", ") || "not written"}.` : ""}
          </p>
          {res.scenarios?.length ? (
            <details className="text-xs text-[#6E5B49]">
              <summary className="cursor-pointer">What each ad set was set up to do</summary>
              <ul className="mt-1 list-disc pl-5">
                {res.scenarios.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {res.report?.errors?.length ? (
            <p className="text-xs text-[#9A4A33]">Report errors: {res.report.errors.join(" | ")}</p>
          ) : null}
          <ul className="divide-y divide-[#EFE6DA] rounded-xl border border-[#EFE6DA] bg-white">
            {res.proposals.map((p, i) => (
              <li key={i} className="px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[#DCCDBA] bg-[#EDE8E0] px-2 py-0.5 text-[11px] font-semibold text-[#5B4A3A]">
                    {p.kind}
                  </span>
                  <span className="text-xs text-[#6E5B49]">{[p.campaign, p.ad_set, p.ad].filter(Boolean).join(" › ")}</span>
                  <span className="ml-auto text-xs text-[#8B7562]">{Math.round(p.confidence * 100)}%</span>
                </div>
                <p className="mt-1 text-[#2A2118]">{p.rationale}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
