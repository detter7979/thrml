"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { utcYesterdayRange } from "@/lib/dates/utc-yesterday"

type RunRow = {
  id: string
  executed_at: string
  success: boolean
  error_message: string | null
  payload: Record<string, unknown> | null
}

export function RunsToolbar() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  async function runNow() {
    setMsg(null)
    const { dateStart, dateEnd } = utcYesterdayRange()
    startTransition(async () => {
      try {
        const res = await fetch("/api/cron/reporting-agent/manual", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dateStart, dateEnd }),
        })
        const json = (await res.json()) as { ok?: boolean; error?: string }
        if (!res.ok || !json.ok) {
          setMsg(json.error ?? `Request failed (${res.status})`)
          return
        }
        setMsg("Run completed.")
        router.refresh()
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Request failed")
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => runNow()}
        disabled={pending}
        className="rounded-full border border-[#CDBCA8] bg-[#2A2118] px-4 py-2 text-sm font-medium text-[#F3EADD] disabled:opacity-50"
      >
        {pending ? "Running…" : "Run reporting now"}
      </button>
      {msg ? <span className="text-sm text-[#6E5B49]">{msg}</span> : null}
    </div>
  )
}

export function PayloadCell({ row }: { row: RunRow }) {
  const p = row.payload
  const rows = typeof p?.rows_ingested === "number" ? p.rows_ingested : "—"
  const dur = typeof p?.duration_ms === "number" ? `${(p.duration_ms / 1000).toFixed(1)}s` : "—"
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[#5B4A3A]">{String(rows)}</span>
      <span className="text-[#A08E7A]">·</span>
      <span className="text-[#5B4A3A]">{dur}</span>
      <details className="ml-1">
        <summary className="cursor-pointer text-sm text-[#8B5A2B] underline decoration-[#DCCDBA] underline-offset-2">
          View JSON
        </summary>
        <pre className="mt-2 max-h-64 max-w-xl overflow-auto rounded-lg bg-[#1A1410] p-3 text-left text-xs text-[#E8DCCB]">
          {JSON.stringify(p ?? {}, null, 2)}
        </pre>
      </details>
    </div>
  )
}
