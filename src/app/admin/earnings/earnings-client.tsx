"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type EarningsRow = {
  id: string
  session_date: string | null
  listing_id: string | null
  listing_title: string | null
  guest_name: string | null
  guest_count: number | null
  start_time: string | null
  end_time: string | null
  duration_hours: number | null
  price_per_person: number | null
  subtotal: number | null
  service_fee: number | null
  host_payout: number | null
  total_charged: number | null
  status: string
}

type DatePreset = "7d" | "14d" | "mtd" | "last_month" | "90d" | "all" | "custom"

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "14d", label: "Last 14 days" },
  { key: "mtd", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "90d", label: "Last 90 days" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
]

function getPresetDates(preset: DatePreset): { start: string | null; end: string | null } {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  if (preset === "all") return { start: null, end: null }
  if (preset === "7d") {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return { start, end: today }
  }
  if (preset === "14d") {
    const start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return { start, end: today }
  }
  if (preset === "mtd") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    return { start, end: today }
  }
  if (preset === "last_month") {
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
    return {
      start: firstOfLastMonth.toISOString().slice(0, 10),
      end: lastOfLastMonth.toISOString().slice(0, 10),
    }
  }
  if (preset === "90d") {
    const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return { start, end: today }
  }
  return { start: null, end: null }
}

function formatMoney(value: number | null) {
  return `$${Number(value ?? 0).toFixed(2)}`
}

function exportToCsv(rows: EarningsRow[], start: string | null, end: string | null) {
  const headers = [
    "Date",
    "Booking ID",
    "Listing ID",
    "Listing Name",
    "Guest Name",
    "Total People",
    "Start Time",
    "End Time",
    "Duration (hrs)",
    "Price/Person",
    "Subtotal",
    "Platform Fee",
    "Host Payout",
    "Total Charged",
    "Status",
  ]

  const csvRows = rows.map((row) => [
    row.session_date ?? "",
    row.id.slice(0, 8),
    row.listing_id?.slice(0, 8) ?? "",
    row.listing_title ?? "",
    row.guest_name ?? "",
    String(row.guest_count ?? ""),
    row.start_time ?? "",
    row.end_time ?? "",
    String(row.duration_hours ?? ""),
    formatMoney(row.price_per_person),
    formatMoney(row.subtotal),
    formatMoney(row.service_fee),
    formatMoney(row.host_payout),
    formatMoney(row.total_charged),
    row.status,
  ])

  const csvContent = [headers, ...csvRows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(","))
    .join("\n")

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  const dateLabel = start && end ? `${start}-to-${end}` : "all-time"
  link.download = `thrml-earnings-${dateLabel}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function AdminEarningsClient({ initialRows }: { initialRows: EarningsRow[] }) {
  const [preset, setPreset] = useState<DatePreset>("mtd")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const { start, end } =
    preset === "custom" ? { start: customStart || null, end: customEnd || null } : getPresetDates(preset)

  const filteredRows = useMemo(() => {
    return initialRows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false
      if (start && row.session_date && row.session_date < start) return false
      if (end && row.session_date && row.session_date > end) return false
      return true
    })
  }, [initialRows, start, end, statusFilter])

  const totals = useMemo(
    () => ({
      bookings: filteredRows.length,
      guests: filteredRows.reduce((sum, r) => sum + Number(r.guest_count ?? 0), 0),
      subtotal: filteredRows.reduce((sum, r) => sum + Number(r.subtotal ?? 0), 0),
      fees: filteredRows.reduce((sum, r) => sum + Number(r.service_fee ?? 0), 0),
      hostPayout: filteredRows.reduce((sum, r) => sum + Number(r.host_payout ?? 0), 0),
      gmv: filteredRows.reduce((sum, r) => sum + Number(r.total_charged ?? 0), 0),
    }),
    [filteredRows]
  )

  return (
    <div className="space-y-5 px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-3xl text-[#2A2118]">Earnings report</h1>
        <Button
          onClick={() => exportToCsv(filteredRows, start, end)}
          className="rounded-full border border-[#B15538] bg-[#C75B3A] text-white hover:bg-[#AF4D31]"
          disabled={filteredRows.length === 0}
        >
          Export CSV ({filteredRows.length})
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="min-w-[220px]">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-[#6E5B49]">Time period</p>
          <Select value={preset} onValueChange={(value) => setPreset(value as DatePreset)}>
            <SelectTrigger className="h-10 rounded-full border-[#D9CBB8] bg-[#FCF8F3] text-[#2A2118]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[220px]">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-[#6E5B49]">Booking status</p>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 rounded-full border-[#D9CBB8] bg-[#FCF8F3] text-[#2A2118]">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {["all", "confirmed", "completed", "cancelled", "pending_host", "pending"].map((status) => (
                <SelectItem key={status} value={status}>
                  {status === "all" ? "All statuses" : status.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {preset === "custom" ? (
        <div className="flex gap-3">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-sm text-[#2A2118]"
          />
          <span className="self-center text-[#6E5B49]">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-sm text-[#2A2118]"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {[
          { label: "Bookings", value: String(totals.bookings) },
          { label: "Total guests", value: String(totals.guests) },
          { label: "Subtotal", value: formatMoney(totals.subtotal) },
          { label: "Platform fees", value: formatMoney(totals.fees) },
          { label: "Host payouts", value: formatMoney(totals.hostPayout) },
          { label: "Gross GMV", value: formatMoney(totals.gmv) },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl border border-[#D9CBB8] bg-[#FCF8F3] p-3">
            <p className="font-serif text-xl text-[#2A2118]">{tile.value}</p>
            <p className="text-xs text-[#6E5B49]">{tile.label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3]">
        <table className="min-w-[1200px] w-full text-xs">
          <thead>
            <tr className="border-b border-[#D9CBB8] bg-[#F1E7DA]">
              {[
                "Date",
                "Booking",
                "Listing ID",
                "Listing",
                "Guest",
                "People",
                "Start",
                "End",
                "Hrs",
                "$/person",
                "Subtotal",
                "Fee",
                "Host payout",
                "Total",
                "Status",
              ].map((h) => (
                <th
                  key={h}
                  className="px-3 py-3 text-left font-medium text-[#6E5B49] uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-4 py-8 text-center text-[#6E5B49]">
                  No bookings in this period
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} className="border-b border-[#E4D8C8] hover:bg-[#EFE3D3]/50">
                  <td className="px-3 py-2 text-[#6E5B49]">{row.session_date ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-[#2A2118]">{row.id.slice(0, 8)}</td>
                  <td className="px-3 py-2 font-mono text-[#6E5B49]">{row.listing_id?.slice(0, 8) ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49] max-w-[140px] truncate">{row.listing_title ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{row.guest_name ?? "—"}</td>
                  <td className="px-3 py-2 text-center text-[#2A2118]">{row.guest_count ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{row.start_time ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{row.end_time ?? "—"}</td>
                  <td className="px-3 py-2 text-[#2A2118]">{row.duration_hours ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{formatMoney(row.price_per_person)}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{formatMoney(row.subtotal)}</td>
                  <td className="px-3 py-2 text-[#B45A3D]">{formatMoney(row.service_fee)}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{formatMoney(row.host_payout)}</td>
                  <td className="px-3 py-2 font-medium text-[#2A2118]">{formatMoney(row.total_charged)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] capitalize ${
                        row.status === "confirmed" || row.status === "completed"
                          ? "bg-emerald-100 text-emerald-700"
                          : row.status === "cancelled"
                            ? "bg-zinc-200 text-zinc-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {row.status}
                    </span>
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
