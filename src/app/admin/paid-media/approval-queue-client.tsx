"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import type { PendingRecViewRow, RecKindT } from "@/types/paid-media"

import { approveRecommendation, modifyRecommendation, rejectRecommendation } from "./actions"

const ACTOR_LABEL: Record<PendingRecViewRow["proposed_by"], string> = {
  HUMAN: "Human",
  EVALUATOR_AGENT: "Evaluator agent",
  META_AGENT: "Meta agent",
  CREATIVE_AGENT: "Creative agent",
  REPORTING_AGENT: "Reporting agent",
  SYSTEM: "System",
}

function kindBadgeClass(kind: RecKindT): string {
  if (kind.startsWith("KILL_")) return "border-[#C75B3A]/50 bg-[#F9E5DD] text-[#9A4A33]"
  if (kind.startsWith("PAUSE_")) return "border-[#D4A82A]/45 bg-[#FDF6E3] text-[#8D6A3D]"
  if (kind.startsWith("CREATE_") || kind.startsWith("LAUNCH_"))
    return "border-[#88A8C8] bg-[#D8E5F0] text-[#2A4A6E]"
  if (kind === "PROMOTE_WINNER" || kind === "ADVANCE_PHASE")
    return "border-[#8BAF7A] bg-[#DDE7D5] text-[#2D4A22]"
  return "border-[#DCCDBA] bg-[#EDE8E0] text-[#5B4A3A]"
}

function formatRelativeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (diffSec < 60) return "just now"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 14) return `${diffDay}d ago`
  return new Date(iso).toLocaleDateString()
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function mapRealtimeToPending(newRow: Record<string, unknown>): PendingRecViewRow | null {
  if (newRow.status !== "PENDING") return null
  if (typeof newRow.id !== "string" || typeof newRow.kind !== "string") return null
  const payload = newRow.payload
  const evidence = newRow.evidence
  return {
    id: newRow.id,
    kind: newRow.kind as PendingRecViewRow["kind"],
    proposed_by: (newRow.proposed_by as PendingRecViewRow["proposed_by"]) ?? "SYSTEM",
    confidence:
      newRow.confidence === null || newRow.confidence === undefined ? null : Number(newRow.confidence),
    rationale: typeof newRow.rationale === "string" ? newRow.rationale : null,
    created_at: typeof newRow.created_at === "string" ? newRow.created_at : new Date().toISOString(),
    expires_at: typeof newRow.expires_at === "string" ? newRow.expires_at : null,
    campaign_name: null,
    service: null,
    geo: null,
    phase: null,
    ad_set_name: null,
    ad_name: null,
    payload:
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {},
    evidence:
      evidence && typeof evidence === "object" && !Array.isArray(evidence)
        ? (evidence as Record<string, unknown>)
        : null,
  }
}

export function ApprovalQueueClient({
  initialRecs,
  initialFetchError,
}: {
  initialRecs: PendingRecViewRow[]
  initialFetchError: string | null
}) {
  const router = useRouter()
  const [rows, setRows] = useState<PendingRecViewRow[]>(initialRecs)
  const [message, setMessage] = useState<string | null>(initialFetchError)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [modifyId, setModifyId] = useState<string | null>(null)
  const [modifyJson, setModifyJson] = useState("")
  const [modifyError, setModifyError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setRows(initialRecs)
  }, [initialRecs])

  const upsertRow = useCallback((row: PendingRecViewRow) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === row.id)
      if (idx === -1) return [row, ...prev]
      const next = [...prev]
      next[idx] = row
      return next.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    })
  }, [])

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("paid-media-recommendations")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "recommendations" },
        (payload) => {
          const row = mapRealtimeToPending((payload.new ?? {}) as Record<string, unknown>)
          if (row) upsertRow(row)
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "recommendations" },
        (payload) => {
          const next = (payload.new ?? {}) as Record<string, unknown>
          const id = typeof next.id === "string" ? next.id : null
          if (!id) return
          if (next.status !== "PENDING") {
            removeRow(id)
            return
          }
          const row = mapRealtimeToPending(next)
          if (row) upsertRow(row)
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [removeRow, upsertRow])

  const countLabel = useMemo(() => {
    const n = rows.length
    return `${n} pending`
  }, [rows.length])

  const openModify = (row: PendingRecViewRow) => {
    setModifyError(null)
    setModifyId(row.id)
    setModifyJson(safeJsonStringify(row.payload))
  }

  const handleApprove = (id: string) => {
    setMessage(null)
    setPendingId(id)
    startTransition(async () => {
      const res = await approveRecommendation(id)
      setPendingId(null)
      if (!res.ok) {
        setMessage(res.error)
        return
      }
      removeRow(id)
      router.refresh()
    })
  }

  const handleRejectSubmit = () => {
    if (!rejectingId) return
    setMessage(null)
    setPendingId(rejectingId)
    startTransition(async () => {
      const res = await rejectRecommendation(rejectingId, rejectReason)
      setPendingId(null)
      if (!res.ok) {
        setMessage(res.error)
        return
      }
      removeRow(rejectingId)
      setRejectingId(null)
      setRejectReason("")
      router.refresh()
    })
  }

  const handleModifySave = () => {
    if (!modifyId) return
    let parsed: object
    try {
      parsed = JSON.parse(modifyJson) as object
    } catch {
      setModifyError("Invalid JSON.")
      return
    }
    setModifyError(null)
    setPendingId(modifyId)
    startTransition(async () => {
      const res = await modifyRecommendation(modifyId, parsed)
      setPendingId(null)
      if (!res.ok) {
        setModifyError(res.error)
        return
      }
      setModifyId(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-[#DCCDBA] bg-[#FCF8F3] px-3 py-1 text-xs font-medium text-[#2A2118]">
          {countLabel}
        </span>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="rounded-full border border-[#CDBCA8] bg-white px-3 py-1 text-xs text-[#2A2118] hover:bg-[#F3EADD]"
        >
          Refresh
        </button>
      </div>

      {message ? (
        <div className="rounded-xl border border-[#C75B3A]/40 bg-[#F9E5DD] px-3 py-2 text-sm text-[#2A2118]">
          {message}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3] px-6 py-12 text-center">
          <p className="font-medium text-[#2A2118]">No pending recommendations</p>
          <p className="mt-1 text-sm text-[#6E5B49]">Approval queue is clear.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const busy = isPending && pendingId === row.id
            const targetBits = [row.campaign_name, row.ad_set_name, row.ad_name].filter(Boolean)
            return (
              <div
                key={row.id}
                className="rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3] p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${kindBadgeClass(row.kind)}`}
                    >
                      {row.kind.replace(/_/g, " ")}
                    </span>
                    {row.confidence !== null && !Number.isNaN(row.confidence) ? (
                      <span className="text-xs text-[#6E5B49]">
                        {Math.round(row.confidence * 100)}% confidence
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-[#8B7562]">
                    {ACTOR_LABEL[row.proposed_by] ?? row.proposed_by} · {formatRelativeAgo(row.created_at)}
                  </p>
                </div>

                {row.rationale ? (
                  <p className="mt-3 text-sm leading-relaxed text-[#2A2118]">{row.rationale}</p>
                ) : (
                  <p className="mt-3 text-sm italic text-[#7A6553]">No rationale provided.</p>
                )}

                {targetBits.length ? (
                  <div className="mt-3 text-xs text-[#6E5B49]">
                    <span className="font-medium text-[#2A2118]">Targets: </span>
                    {targetBits.join(" · ")}
                  </div>
                ) : null}

                <details className="mt-3 rounded-xl border border-[#E7DACA] bg-white px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-[#2A2118]">Payload preview</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] text-[#5B4A3A]">
                    {safeJsonStringify(row.payload)}
                  </pre>
                </details>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleApprove(row.id)}
                    className="rounded-lg bg-[#9A4A33] px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setRejectingId(row.id)
                      setRejectReason("")
                    }}
                    className="rounded-lg border border-[#CDBCA8] bg-white px-4 py-2 text-sm text-[#2A2118] hover:bg-[#F3EADD] disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openModify(row)}
                    className="rounded-lg border border-[#CDBCA8] bg-white px-4 py-2 text-sm text-[#2A2118] hover:bg-[#F3EADD] disabled:opacity-50"
                  >
                    Modify
                  </button>
                </div>

                {rejectingId === row.id ? (
                  <div className="mt-4 rounded-xl border border-[#E7DACA] bg-white p-3">
                    <label className="text-xs font-medium text-[#2A2118]" htmlFor={`reject-${row.id}`}>
                      Rejection reason
                    </label>
                    <textarea
                      id={`reject-${row.id}`}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-[#DCCDBA] bg-[#FCF8F3] px-2 py-1.5 text-sm text-[#2A2118] outline-none focus:border-[#9A4A33]"
                      placeholder="Why is this being rejected?"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleRejectSubmit}
                        className="rounded-lg bg-[#5B4A3A] px-3 py-1.5 text-xs text-white hover:opacity-95 disabled:opacity-50"
                      >
                        Confirm reject
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingId(null)
                          setRejectReason("")
                        }}
                        className="rounded-lg border border-[#CDBCA8] px-3 py-1.5 text-xs text-[#2A2118]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {modifyId ? (
        <div className="fixed inset-0 z-40 flex bg-black/20">
          <button
            type="button"
            className="min-w-0 flex-1 cursor-default bg-transparent"
            aria-label="Close drawer"
            onClick={() => {
              setModifyId(null)
              setModifyError(null)
            }}
          />
          <div
            className="h-full w-full max-w-md shrink-0 overflow-y-auto border-l border-[#DCCDBA] bg-[#F3EADD] p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modify-drawer-title"
          >
            <h2 id="modify-drawer-title" className="font-serif text-xl text-[#2A2118]">
              Edit payload
            </h2>
            <p className="mt-1 text-xs text-[#6E5B49]">JSON object stored as modified_payload. Status stays pending.</p>
            <textarea
              value={modifyJson}
              onChange={(e) => setModifyJson(e.target.value)}
              rows={18}
              className="mt-4 w-full rounded-lg border border-[#DCCDBA] bg-[#FCF8F3] p-3 font-mono text-xs text-[#2A2118] outline-none focus:border-[#9A4A33]"
            />
            {modifyError ? <p className="mt-2 text-sm text-[#9A4A33]">{modifyError}</p> : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={isPending && pendingId === modifyId}
                onClick={handleModifySave}
                className="rounded-lg bg-[#9A4A33] px-4 py-2 text-sm text-white hover:opacity-95 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setModifyId(null)
                  setModifyError(null)
                }}
                className="rounded-lg border border-[#CDBCA8] bg-white px-4 py-2 text-sm text-[#2A2118]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
