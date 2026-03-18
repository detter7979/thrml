"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"

type AdminListingRow = {
  id: string
  title: string | null
  service_type: string | null
  host_name: string | null
  city_state: string
  is_active: boolean
  is_deleted: boolean
  bookings_count: number
  created_at: string | null
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "—"
  return parsed.toLocaleDateString()
}

export function AdminListingsClient({ rows }: { rows: AdminListingRow[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const pageSize = 10

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return rows
    return rows.filter((row) =>
      [row.id, row.title ?? "", row.service_type ?? "", row.host_name ?? "", row.city_state].some((value) =>
        value.toLowerCase().includes(normalized)
      )
    )
  }, [rows, query])
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)
  const selectablePageIds = pageRows
    .filter((row) => !row.is_deleted)
    .map((row) => row.id)
  const allPageSelected =
    selectablePageIds.length > 0 &&
    selectablePageIds.every((id) => selectedIds.has(id))
  const bulkEligibleCount = filteredRows.filter(
    (row) => selectedIds.has(row.id) && row.is_active && !row.is_deleted
  ).length

  async function toggleActive(id: string, nextActive: boolean) {
    setBusyId(id)
    setError(null)
    try {
      const response = await fetch(`/api/admin/listings/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextActive }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(payload.error ?? "Unable to update listing status.")
        return
      }
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  function toggleSelection(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleSelectAllOnPage(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const id of selectablePageIds) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  async function deactivateSelected() {
    if (bulkEligibleCount === 0) {
      setError("Select at least one active listing.")
      return
    }
    setBulkBusy(true)
    setError(null)
    try {
      const idsToDeactivate = filteredRows
        .filter((row) => selectedIds.has(row.id) && row.is_active && !row.is_deleted)
        .map((row) => row.id)
      const results = await Promise.all(
        idsToDeactivate.map(async (id) => {
          const response = await fetch(`/api/admin/listings/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: false }),
          })
          return { id, ok: response.ok }
        })
      )
      const failed = results.filter((result) => !result.ok)
      if (failed.length) {
        setError(`Failed to deactivate ${failed.length} listing(s).`)
      }
      setSelectedIds(new Set())
      router.refresh()
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="space-y-4 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl text-[#2A2118]">Listings management</h1>
        <p className="text-sm text-[#6E5B49]">{filteredRows.length} total listings</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-[#8D7864]" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
            placeholder="Search title, id, host, city..."
            className="w-full rounded-xl border border-[#D9CBB8] bg-[#FCF8F3] py-2 pr-3 pl-9 text-sm text-[#2A2118]"
          />
        </label>
        <div className="flex items-center gap-2 text-xs text-[#6E5B49]">
          <Button
            size="sm"
            className="border border-[#B15538] bg-[#C75B3A] text-[#fff] hover:bg-[#AF4D31]"
            disabled={bulkBusy || bulkEligibleCount === 0}
            onClick={() => void deactivateSelected()}
          >
            Deactivate selected ({bulkEligibleCount})
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-[#CDBCA8] bg-[#FCF8F3] text-[#2A2118] hover:bg-[#E6D8C6]"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Prev
          </Button>
          <span>
            Page {page} / {pageCount}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="border-[#CDBCA8] bg-[#FCF8F3] text-[#2A2118] hover:bg-[#E6D8C6]"
            disabled={page >= pageCount}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3]">
        <table className="min-w-[1200px] w-full text-xs">
          <thead>
            <tr className="border-b border-[#D9CBB8] bg-[#F1E7DA]">
              <th className="px-3 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={(event) => toggleSelectAllOnPage(event.target.checked)}
                  aria-label="Select all listings on page"
                  className="size-4 accent-[#C75B3A]"
                />
              </th>
              {["ID", "Title", "Service", "Host", "City/State", "Status", "Bookings", "Created", "Actions"].map(
                (h) => (
                  <th key={h} className="px-3 py-3 text-left font-medium uppercase tracking-wide text-[#6E5B49]">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const status = row.is_deleted ? "deleted" : row.is_active ? "active" : "inactive"
              const disabled = busyId === row.id || bulkBusy
              return (
                <tr key={row.id} className="border-b border-[#E4D8C8] hover:bg-[#EFE3D3]/50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      disabled={row.is_deleted || bulkBusy}
                      onChange={(event) => toggleSelection(row.id, event.target.checked)}
                      aria-label={`Select listing ${row.title ?? row.id}`}
                      className="size-4 accent-[#C75B3A]"
                    />
                  </td>
                  <td
                    className="px-3 py-2 text-[#7A6553]"
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace' }}
                  >
                    {row.id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2 text-[#2A2118]">{row.title ?? "Untitled listing"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{row.service_type ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{row.host_name ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{row.city_state}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] capitalize ${
                        status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : status === "inactive"
                            ? "bg-zinc-200 text-zinc-700"
                            : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#2A2118]">{row.bookings_count}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{formatDate(row.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-7 border-[#CDBCA8] bg-[#FCF8F3] text-xs text-[#2A2118] hover:bg-[#E6D8C6]"
                      >
                        <Link href={`/listings/${row.id}`}>View</Link>
                      </Button>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-7 border-[#CDBCA8] bg-[#FCF8F3] text-xs text-[#2A2118] hover:bg-[#E6D8C6]"
                      >
                        <Link href={`/dashboard/listings/${row.id}/edit`}>Edit</Link>
                      </Button>
                      {!row.is_deleted ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-[#CDBCA8] bg-[#FCF8F3] text-xs text-[#2A2118] hover:bg-[#E6D8C6]"
                          disabled={disabled}
                          onClick={() => toggleActive(row.id, !row.is_active)}
                        >
                          {row.is_active ? "Deactivate" : "Reactivate"}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
