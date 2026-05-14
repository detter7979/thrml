"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

export function MetaAgentRunButtons() {
  const router = useRouter()
  const [busy, setBusy] = useState<"run" | "dry" | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function post(dryRun: boolean) {
    setBusy(dryRun ? "dry" : "run")
    setMsg(null)
    try {
      const res = await fetch("/api/cron/meta-ads-agent/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        processed?: number
        succeeded?: number
        failed?: number
        dry_run?: boolean
      }
      if (!res.ok || !json.ok) {
        setMsg(json.error ?? `HTTP ${res.status}`)
        return
      }
      setMsg(
        `Done: processed ${json.processed ?? 0}, ok ${json.succeeded ?? 0}, failed ${json.failed ?? 0}${json.dry_run ? " (dry run)" : ""}.`,
      )
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Request failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void post(false)}
        className="rounded-lg bg-[#2A2118] px-4 py-2 text-sm font-medium text-white hover:bg-[#1F170F] disabled:opacity-50"
      >
        {busy === "run" ? "Running…" : "Run agent now"}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void post(true)}
        className="rounded-lg border border-[#DCCDBA] bg-[#FCF8F3] px-4 py-2 text-sm font-medium text-[#2A2118] hover:bg-[#F7EFE4] disabled:opacity-50"
      >
        {busy === "dry" ? "Running…" : "Dry run"}
      </button>
      {msg ? <p className="text-sm text-[#5B4A3A]">{msg}</p> : null}
    </div>
  )
}
