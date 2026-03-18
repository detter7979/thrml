"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"

type AdminBookingRow = {
  id: string
  guest_id: string | null
  host_id: string | null
  listing_id: string | null
  listing_title: string | null
  guest_name: string | null
  host_name: string | null
  session_date: string | null
  start_time: string | null
  end_time: string | null
  status: string
  total_charged: number | null
  host_payout: number | null
  service_fee: number | null
  refunded_amount: number | null
}

function money(value: number | null) {
  return `$${Number(value ?? 0).toFixed(2)}`
}

export function AdminBookingsClient({
  initialRows,
  preselectedUserId,
}: {
  initialRows: AdminBookingRow[]
  preselectedUserId: string | null
}) {
  const [statusFilter, setStatusFilter] = useState("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refundAmounts, setRefundAmounts] = useState<Record<string, string>>({})
  const [rows, setRows] = useState(initialRows)

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (preselectedUserId && row.guest_id !== preselectedUserId && row.host_id !== preselectedUserId) return false
      if (statusFilter !== "all" && row.status !== statusFilter) return false
      if (startDate && row.session_date && row.session_date < startDate) return false
      if (endDate && row.session_date && row.session_date > endDate) return false
      return true
    })
  }, [rows, preselectedUserId, statusFilter, startDate, endDate])

  async function cancelBooking(id: string) {
    const confirmed = window.confirm("Cancel booking and issue host-style cancellation refund flow?")
    if (!confirmed) return
    setBusyId(id)
    setError(null)
    try {
      const response = await fetch(`/api/bookings/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelled_by: "host", reason: "admin_override_cancel" }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(payload.error ?? "Unable to cancel booking.")
        return
      }
      setRows((current) =>
        current.map((row) => (row.id === id ? { ...row, status: "cancelled" } : row))
      )
    } finally {
      setBusyId(null)
    }
  }

  async function forceRefund(id: string) {
    const amountRaw = refundAmounts[id] ?? ""
    const amount = Number(amountRaw)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid refund amount.")
      return
    }
    setBusyId(id)
    setError(null)
    try {
      const response = await fetch("/api/admin/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: id, amount }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string; refundedAmount?: number }
      if (!response.ok) {
        setError(payload.error ?? "Unable to issue refund.")
        return
      }
      setRows((current) =>
        current.map((row) =>
          row.id === id
            ? { ...row, refunded_amount: Number(row.refunded_amount ?? 0) + Number(payload.refundedAmount ?? amount) }
            : row
        )
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-[#2A2118]">Bookings management</h1>
          {preselectedUserId ? (
            <p className="mt-1 text-xs text-[#6E5B49]">Filtered to user: {preselectedUserId.slice(0, 8)}</p>
          ) : null}
        </div>
        <p className="text-sm text-[#6E5B49]">{filteredRows.length} visible bookings</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {["all", "confirmed", "pending_host", "pending", "cancelled", "completed"].map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`rounded-full px-3 py-1 text-xs capitalize ${
              statusFilter === status
                ? "bg-[#DCCAB6] text-[#2A2118]"
                : "bg-[#F8F2EA] text-[#6E5B49] hover:bg-[#EADCCB] hover:text-[#2A2118]"
            }`}
          >
            {status}
          </button>
        ))}
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-md border border-[#D9CBB8] bg-[#FCF8F3] px-2 py-1 text-xs text-[#2A2118]"
        />
        <span className="text-[#6E5B49]">to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-md border border-[#D9CBB8] bg-[#FCF8F3] px-2 py-1 text-xs text-[#2A2118]"
        />
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
              {[
                "Booking",
                "Guest",
                "Host",
                "Listing",
                "Date",
                "Time",
                "Status",
                "Total",
                "Host payout",
                "Service fee",
                "Refunded",
                "Actions",
              ].map((h) => (
                <th key={h} className="px-3 py-3 text-left font-medium uppercase tracking-wide text-[#6E5B49]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-[#7A6A5D]">
                  No bookings found
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} className="border-b border-[#E4D8C8] hover:bg-[#EFE3D3]/50">
                  <td className="px-3 py-2 font-mono text-[#7A6553]">{row.id.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{row.guest_name ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{row.host_name ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">
                    {row.listing_id ? (
                      <Link className="underline-offset-2 hover:underline" href={`/listings/${row.listing_id}`}>
                        {row.listing_title ?? row.listing_id.slice(0, 8)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-[#6E5B49]">{row.session_date ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">
                    {[row.start_time ?? "—", row.end_time ?? "—"].join(" - ")}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-[#E7DACA] px-2 py-0.5 text-[10px] capitalize text-[#2A2118]">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#2A2118]">{money(row.total_charged)}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{money(row.host_payout)}</td>
                  <td className="px-3 py-2 text-[#B45A3D]">{money(row.service_fee)}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{money(row.refunded_amount)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {row.status !== "cancelled" ? (
                        <Button
                          size="sm"
                          className="h-7 border border-rose-300 bg-rose-50 text-xs text-rose-700 hover:bg-rose-100"
                          disabled={busyId === row.id}
                          onClick={() => cancelBooking(row.id)}
                        >
                          Cancel + refund
                        </Button>
                      ) : null}
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Amount"
                        value={refundAmounts[row.id] ?? ""}
                        onChange={(e) =>
                          setRefundAmounts((current) => ({ ...current, [row.id]: e.target.value }))
                        }
                        className="h-7 w-20 rounded border border-[#D9CBB8] bg-white px-2 text-xs text-[#2A2118]"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-[#CDBCA8] bg-[#FCF8F3] text-xs text-[#2A2118] hover:bg-[#E6D8C6]"
                        disabled={busyId === row.id}
                        onClick={() => forceRefund(row.id)}
                      >
                        Force refund
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
