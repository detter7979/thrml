"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import { REPORT_REASONS } from "@/lib/moderation/reasons"

export type ReportRow = {
  id: string
  targetType: "listing" | "review" | "message" | "user"
  reason: string
  details: string | null
  status: "open" | "actioned" | "dismissed"
  adminNote: string | null
  createdAt: string
  resolvedAt: string | null
  reporterName: string
  reportedUserId: string | null
  reportedName: string
  preview: string
  href: string | null
  live: boolean
}

const RESPONSE_HOURS = 24

function hoursLeft(createdAt: string) {
  return Math.round((new Date(createdAt).getTime() + RESPONSE_HOURS * 3600_000 - Date.now()) / 3600_000)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

const reasonLabel = (value: string) => REPORT_REASONS.find((r) => r.value === value)?.label ?? value

export function ReportsClient({ initialRows, loadError }: { initialRows: ReportRow[]; loadError: string | null }) {
  const [rows, setRows] = useState(initialRows)
  const [filter, setFilter] = useState<"open" | "all">("open")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(loadError)

  const visible = useMemo(() => (filter === "open" ? rows.filter((r) => r.status === "open") : rows), [rows, filter])
  const openCount = rows.filter((r) => r.status === "open").length

  async function update(row: ReportRow, status: ReportRow["status"], action?: "hide_review" | "deactivate_listing") {
    const note = status === "open" ? undefined : window.prompt("Note for the record (optional)") ?? undefined
    setBusyId(row.id)
    setError(null)
    try {
      const response = await fetch(`/api/admin/reports/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note, action }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Update failed")
      setRows((current) =>
        current.map((r) =>
          r.id === row.id
            ? {
                ...r,
                status,
                adminNote: note ?? r.adminNote,
                resolvedAt: status === "open" ? null : new Date().toISOString(),
                live: action ? false : r.live,
              }
            : r
        )
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-[#2A2118]">Reports</h1>
          <p className="mt-1 text-sm text-[#6E5B49]">
            Reported listings, reviews, messages and people. Act on each within {RESPONSE_HOURS} hours (App Store
            requirement). To suspend someone, use their row in Users.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          {(["open", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-1.5 ${
                filter === value ? "bg-[#1A1410] text-white" : "border border-[#E7DACA] bg-white text-[#5E4E42]"
              }`}
            >
              {value === "open" ? `Open (${openCount})` : "All"}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-[#E7DACA] bg-white">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#E7DACA] bg-[#FAF6F2] text-xs uppercase tracking-wide text-[#9A4A33]">
              <th className="px-4 py-3 font-medium">Reported</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">People</th>
              <th className="px-4 py-3 font-medium">Clock</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0E8E2]">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[#6E5B49]">
                  {filter === "open" ? "No open reports." : "No reports yet."}
                </td>
              </tr>
            ) : (
              visible.map((row) => {
                const left = hoursLeft(row.createdAt)
                const busy = busyId === row.id
                return (
                  <tr key={row.id} className="align-top">
                    <td className="max-w-xs px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-[#9A4A33]">
                        {row.targetType}
                        {!row.live && row.targetType !== "user" && row.targetType !== "message" ? " · hidden" : ""}
                      </p>
                      <p className="mt-1 line-clamp-3 text-[#2A2118]">{row.preview}</p>
                      {row.href ? (
                        <Link href={row.href} className="mt-1 inline-block text-xs text-[#C75B3A] underline">
                          Open
                        </Link>
                      ) : null}
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <p className="font-medium text-[#2A2118]">{reasonLabel(row.reason)}</p>
                      {row.details ? <p className="mt-1 text-xs text-[#6E5B49]">{row.details}</p> : null}
                      {row.adminNote ? <p className="mt-1 text-xs italic text-[#8A7A6D]">Note: {row.adminNote}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#6E5B49]">
                      <p>By {row.reporterName}</p>
                      <p className="mt-1">
                        About{" "}
                        {row.reportedUserId ? (
                          <Link href="/admin/users" className="underline">
                            {row.reportedName}
                          </Link>
                        ) : (
                          row.reportedName
                        )}
                      </p>
                      <p className="mt-1">{formatDate(row.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {row.status !== "open" ? (
                        <span className="text-emerald-700">
                          {row.status === "actioned" ? "Actioned" : "Dismissed"}
                          {row.resolvedAt ? ` ${formatDate(row.resolvedAt)}` : ""}
                        </span>
                      ) : left < 0 ? (
                        <span className="font-medium text-red-600">{Math.abs(left)}h overdue</span>
                      ) : (
                        <span className="text-[#6E5B49]">{left}h left</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.status === "open" ? (
                        <div className="flex flex-col items-start gap-1.5">
                          {row.targetType === "review" && row.live ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void update(row, "actioned", "hide_review")}
                              className="rounded-full bg-[#1A1410] px-3 py-1 text-xs text-white disabled:opacity-50"
                            >
                              Hide review
                            </button>
                          ) : null}
                          {row.targetType === "listing" && row.live ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void update(row, "actioned", "deactivate_listing")}
                              className="rounded-full bg-[#1A1410] px-3 py-1 text-xs text-white disabled:opacity-50"
                            >
                              Deactivate listing
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void update(row, "actioned")}
                            className="rounded-full border border-[#E7DACA] px-3 py-1 text-xs text-[#2A2118] disabled:opacity-50"
                          >
                            Mark actioned
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void update(row, "dismissed")}
                            className="text-xs text-[#8A7A6D] underline disabled:opacity-50"
                          >
                            Dismiss
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void update(row, "open")}
                          className="text-xs text-[#8A7A6D] underline disabled:opacity-50"
                        >
                          Reopen
                        </button>
                      )}
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
