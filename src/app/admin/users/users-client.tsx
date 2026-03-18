"use client"

import Link from "next/link"
import { Search } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"

type AdminUserRow = {
  id: string
  full_name: string | null
  email: string | null
  created_at: string | null
  intent: string
  total_bookings: number
  total_listings: number
  is_host: boolean
  is_admin: boolean
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "—"
  return parsed.toLocaleDateString()
}

export function AdminUsersClient({ initialRows }: { initialRows: AdminUserRow[] }) {
  const [rows, setRows] = useState(initialRows)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [messagingId, setMessagingId] = useState<string | null>(null)

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return rows
    return rows.filter((row) =>
      [row.id, row.full_name ?? "", row.email ?? "", row.intent].some((value) =>
        value.toLowerCase().includes(normalized)
      )
    )
  }, [rows, query])
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)

  async function toggleAdmin(userId: string) {
    setBusyId(userId)
    setError(null)
    try {
      const response = await fetch(`/api/admin/users/${userId}/toggle-admin`, { method: "PATCH" })
      const payload = (await response.json().catch(() => ({}))) as { error?: string; is_admin?: boolean }
      if (!response.ok) {
        setError(payload.error ?? "Unable to toggle admin.")
        return
      }
      setRows((current) =>
        current.map((row) => (row.id === userId ? { ...row, is_admin: Boolean(payload.is_admin) } : row))
      )
    } finally {
      setBusyId(null)
    }
  }

  async function messageUser(user: AdminUserRow) {
    const subject = window.prompt("Message subject/context (optional):", "Admin follow-up") ?? ""
    const body = window.prompt(`Message ${user.full_name ?? user.email ?? user.id}:`)
    if (!body || !body.trim()) return

    setMessagingId(user.id)
    setError(null)
    try {
      const response = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: user.id,
          subject: subject.trim() || null,
          body: body.trim(),
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        conversationId?: string
      }
      if (!response.ok || !payload.conversationId) {
        setError(payload.error ?? "Unable to send message.")
        return
      }
      window.location.href = `/admin/messages?conversationId=${payload.conversationId}`
    } finally {
      setMessagingId(null)
    }
  }

  return (
    <div className="space-y-4 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl text-[#2A2118]">User management</h1>
        <p className="text-sm text-[#6E5B49]">{filteredRows.length} users</p>
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
            placeholder="Search name, email, id, intent..."
            className="w-full rounded-xl border border-[#D9CBB8] bg-[#FCF8F3] py-2 pr-3 pl-9 text-sm text-[#2A2118]"
          />
        </label>
        <div className="flex items-center gap-2 text-xs text-[#6E5B49]">
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
        <table className="min-w-[1300px] w-full text-xs">
          <thead>
            <tr className="border-b border-[#D9CBB8] bg-[#F1E7DA]">
              {["User ID", "Name", "Email", "Joined", "Intent", "Bookings", "Listings", "Is host", "Is admin", "Actions"].map(
                (h) => (
                  <th key={h} className="px-3 py-3 text-left font-medium uppercase tracking-wide text-[#6E5B49]">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id} className="border-b border-[#E4D8C8] hover:bg-[#EFE3D3]/50">
                <td className="px-3 py-2 font-mono text-[#7A6553]">{row.id.slice(0, 8)}</td>
                <td className="px-3 py-2 text-[#2A2118]">{row.full_name ?? "—"}</td>
                <td className="px-3 py-2 text-[#6E5B49]">{row.email ?? "—"}</td>
                <td className="px-3 py-2 text-[#6E5B49]">{formatDate(row.created_at)}</td>
                <td className="px-3 py-2 text-[#6E5B49] capitalize">{row.intent}</td>
                <td className="px-3 py-2 text-[#2A2118]">{row.total_bookings}</td>
                <td className="px-3 py-2 text-[#2A2118]">{row.total_listings}</td>
                <td className="px-3 py-2 text-[#6E5B49]">{row.is_host ? "Yes" : "No"}</td>
                <td className="px-3 py-2 text-[#6E5B49]">{row.is_admin ? "Yes" : "No"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-7 border-[#CDBCA8] bg-[#FCF8F3] text-xs text-[#2A2118] hover:bg-[#E6D8C6]"
                    >
                      <Link href={`/admin/bookings?userId=${row.id}`}>View bookings</Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 border-[#CDBCA8] bg-[#FCF8F3] text-xs text-[#2A2118] hover:bg-[#E6D8C6]"
                      disabled={messagingId === row.id}
                      onClick={() => void messageUser(row)}
                    >
                      Message user
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 border border-[#B15538] bg-[#C75B3A] text-xs text-white hover:bg-[#AF4D31]"
                      disabled={busyId === row.id}
                      onClick={() => toggleAdmin(row.id)}
                    >
                      {row.is_admin ? "Remove admin" : "Make admin"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
