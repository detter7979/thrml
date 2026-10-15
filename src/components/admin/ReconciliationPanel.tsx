"use client"

import { ExternalLink, FileSpreadsheet } from "lucide-react"
import { useState } from "react"

type RunResult =
  | {
      ok: true
      month: string
      sheet: { url: string; tab: string }
      bottomLine: { revenue: number; expenses: number; stripeFees: number; net: number }
      checks: { label: string; ok: boolean; detail: string }[]
    }
  | { ok: false; month: string; error: string }

function lastMonth() {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 7)
}

const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`

/** Builds a month's reconciliation tab in Google Sheets on demand (it also runs automatically on the 1st). */
export function ReconciliationPanel() {
  const [month, setMonth] = useState(lastMonth())
  const [email, setEmail] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)

  async function run() {
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch("/api/admin/finance/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, email }),
      })
      const json = (await res.json().catch(() => ({ ok: false, month, error: `HTTP ${res.status}` }))) as RunResult
      setResult(json)
    } catch (e) {
      setResult({ ok: false, month, error: e instanceof Error ? e.message : "Request failed" })
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="rounded-xl border border-[#DCCDBA] bg-[#F3EADD] p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-xl text-[#2A2118]">Monthly reconciliation</h2>
          <p className="mt-1 text-sm text-[#5B4A3A]">
            Money in vs out for a month, budget vs actual and Stripe checks, written to a &ldquo;Close_Month_Year&rdquo; tab in the Finance
            Tracker. Runs automatically on the 1st for the previous month and emails you.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1 text-xs text-[#5B4A3A]">
            Month
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-md border border-[#DCCDBA] bg-white px-2 py-1.5 text-sm text-[#2A2118]"
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-xs text-[#5B4A3A]">
            <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
            Email me
          </label>
          <button
            type="button"
            onClick={run}
            disabled={running || !month}
            className="inline-flex items-center gap-2 rounded-md bg-[#2A2118] px-3 py-2 text-sm text-[#F3EADD] disabled:opacity-60"
          >
            <FileSpreadsheet className="size-4" aria-hidden />
            {running ? "Building…" : "Run reconciliation"}
          </button>
        </div>
      </div>

      {result && !result.ok ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {result.month}: {result.error}
        </p>
      ) : null}

      {result && result.ok ? (
        <div className="mt-4 space-y-3 text-sm text-[#2A2118]">
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              ["In (net platform revenue)", result.bottomLine.revenue],
              ["Out (costs + ads)", -result.bottomLine.expenses],
              ["Stripe fees", -result.bottomLine.stripeFees],
              ["Net", result.bottomLine.net],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg border border-[#DCCDBA] bg-white/60 p-3">
                <p className="text-xs text-[#5B4A3A]">{label}</p>
                <p className="mt-1 font-serif text-lg">{usd(value as number)}</p>
              </div>
            ))}
          </div>
          <ul className="space-y-1">
            {result.checks.map((c) => (
              <li key={c.label} className={c.ok ? "text-[#2F6B3A]" : "text-[#9A4A33]"}>
                {c.ok ? "✓" : "!"} {c.label} — <span className="text-[#5B4A3A]">{c.detail}</span>
              </li>
            ))}
          </ul>
          <a href={result.sheet.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#9A4A33] underline">
            Open {result.sheet.tab} <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      ) : null}
    </section>
  )
}
