"use client"

import { useMemo, useState } from "react"

import { formatServiceType } from "@/lib/constants/service-types"
import {
  cashPlatformTakeCents,
  dollarsFromCents,
  grossPlatformTakeCents,
  promoCreditsAppliedCents,
} from "@/lib/finance/booking-economics"
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
  booked_at: string | null
  listing_id: string | null
  listing_title: string | null
  service_type: string | null
  city: string | null
  state: string | null
  host_name: string | null
  guest_name: string | null
  guest_email: string | null
  guest_count: number | null
  start_time: string | null
  end_time: string | null
  duration_hours: number | null
  price_per_person: number | null
  subtotal: number | null
  service_fee: number | null
  guest_fee: number | null
  host_fee: number | null
  host_payout: number | null
  total_charged: number | null
  refunded_amount: number | null
  referral_credit_applied_cents: number | null
  user_credit_applied_cents: number | null
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

function formatMarket(city: string | null, state: string | null) {
  if (city && state) return `${city}, ${state}`
  if (city) return city
  if (state) return state
  return "—"
}

function marketKey(city: string | null, state: string | null) {
  if (!city && !state) return "unknown"
  return `${city ?? ""}|${state ?? ""}`.toLowerCase()
}

function marketLabel(key: string) {
  if (key === "unknown") return "Unknown"
  const [city, state] = key.split("|")
  return formatMarket(city || null, state || null)
}

function exportToCsv(rows: EarningsRow[], start: string | null, end: string | null) {
  const headers = [
    "Session Date",
    "Booked On",
    "Booking ID",
    "City",
    "State",
    "Service Type",
    "Listing ID",
    "Listing Name",
    "Host Name",
    "Guest Name",
    "Total People",
    "Start Time",
    "End Time",
    "Duration (hrs)",
    "Price/Person",
    "Subtotal",
    "Guest Fee",
    "Host Fee",
    "Platform Fee",
    "Host Payout",
    "Total Charged",
    "Refunded",
    "Status",
  ]

  const csvRows = rows.map((row) => [
    row.session_date ?? "",
    row.booked_at ?? "",
    row.id,
    row.city ?? "",
    row.state ?? "",
    row.service_type ? formatServiceType(row.service_type) : "",
    row.listing_id ?? "",
    row.listing_title ?? "",
    row.host_name ?? "",
    row.guest_name ?? "",
    String(row.guest_count ?? ""),
    row.start_time ?? "",
    row.end_time ?? "",
    String(row.duration_hours ?? ""),
    formatMoney(row.price_per_person),
    formatMoney(row.subtotal),
    formatMoney(row.guest_fee),
    formatMoney(row.host_fee),
    formatMoney(row.service_fee),
    formatMoney(row.host_payout),
    formatMoney(row.total_charged),
    formatMoney(row.refunded_amount),
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

export function AdminEarningsClient({
  initialRows,
  loadError = null,
}: {
  initialRows: EarningsRow[]
  loadError?: string | null
}) {
  const [preset, setPreset] = useState<DatePreset>("all")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [marketFilter, setMarketFilter] = useState<string>("all")
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("all")

  const { start, end } =
    preset === "custom" ? { start: customStart || null, end: customEnd || null } : getPresetDates(preset)

  const marketOptions = useMemo(() => {
    const keys = new Set(initialRows.map((row) => marketKey(row.city, row.state)))
    return Array.from(keys).sort((a, b) => {
      if (a === "unknown") return 1
      if (b === "unknown") return -1
      return a.localeCompare(b)
    })
  }, [initialRows])

  const serviceTypeOptions = useMemo(() => {
    const types = new Set(
      initialRows.map((row) => row.service_type).filter((value): value is string => Boolean(value))
    )
    return Array.from(types).sort((a, b) => formatServiceType(a).localeCompare(formatServiceType(b)))
  }, [initialRows])

  const filteredRows = useMemo(() => {
    return initialRows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false
      if (marketFilter !== "all" && marketKey(row.city, row.state) !== marketFilter) return false
      if (serviceTypeFilter !== "all" && row.service_type !== serviceTypeFilter) return false
      if (start && row.session_date && row.session_date < start) return false
      if (end && row.session_date && row.session_date > end) return false
      return true
    })
  }, [initialRows, start, end, statusFilter, marketFilter, serviceTypeFilter])

  const totals = useMemo(() => {
    const paid = filteredRows.filter((r) => r.status === "confirmed" || r.status === "completed")
    return {
      bookings: filteredRows.length,
      paidBookings: paid.length,
      guests: filteredRows.reduce((sum, r) => sum + Number(r.guest_count ?? 0), 0),
      subtotal: filteredRows.reduce((sum, r) => sum + Number(r.subtotal ?? 0), 0),
      guestFees: filteredRows.reduce(
        (sum, r) => sum + Number(r.guest_fee ?? r.service_fee ?? 0),
        0
      ),
      grossTake: paid.reduce((sum, r) => sum + dollarsFromCents(grossPlatformTakeCents(r)), 0),
      cashTake: paid.reduce((sum, r) => sum + dollarsFromCents(cashPlatformTakeCents(r)), 0),
      promoCredits: paid.reduce((sum, r) => sum + dollarsFromCents(promoCreditsAppliedCents(r)), 0),
      refunds: filteredRows.reduce((sum, r) => sum + Number(r.refunded_amount ?? 0), 0),
      hostPayout: paid.reduce((sum, r) => sum + Number(r.host_payout ?? 0), 0),
      gmv: filteredRows.reduce((sum, r) => sum + Number(r.total_charged ?? 0), 0),
    }
  }, [filteredRows])

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

      {loadError ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Could not load bookings: {loadError}. Check that recent finance migrations have been applied.
        </div>
      ) : null}

      {initialRows.length === 0 && !loadError ? (
        <div className="rounded-xl border border-[#D9CBB8] bg-[#FCF8F3] px-4 py-3 text-sm text-[#6E5B49]">
          No bookings found in the database yet.
        </div>
      ) : null}

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
        <div className="min-w-[220px]">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-[#6E5B49]">Market</p>
          <Select value={marketFilter} onValueChange={setMarketFilter}>
            <SelectTrigger className="h-10 rounded-full border-[#D9CBB8] bg-[#FCF8F3] text-[#2A2118]">
              <SelectValue placeholder="All markets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All markets</SelectItem>
              {marketOptions.map((market) => (
                <SelectItem key={market} value={market}>
                  {marketLabel(market)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[220px]">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-[#6E5B49]">Service type</p>
          <Select value={serviceTypeFilter} onValueChange={setServiceTypeFilter}>
            <SelectTrigger className="h-10 rounded-full border-[#D9CBB8] bg-[#FCF8F3] text-[#2A2118]">
              <SelectValue placeholder="All services" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              {serviceTypeOptions.map((serviceType) => (
                <SelectItem key={serviceType} value={serviceType}>
                  {formatServiceType(serviceType)}
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        {[
          { label: "Bookings", value: String(totals.bookings) },
          { label: "Paid sessions", value: String(totals.paidBookings) },
          { label: "Gross GMV", value: formatMoney(totals.gmv) },
          { label: "Gross platform take", value: formatMoney(totals.grossTake) },
          { label: "Cash platform take", value: formatMoney(totals.cashTake) },
          { label: "Promo credits", value: formatMoney(totals.promoCredits) },
          { label: "Refunds", value: formatMoney(totals.refunds) },
          { label: "Host payouts", value: formatMoney(totals.hostPayout) },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl border border-[#D9CBB8] bg-[#FCF8F3] p-3">
            <p className="font-serif text-xl text-[#2A2118]">{tile.value}</p>
            <p className="text-xs text-[#6E5B49]">{tile.label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3]">
        <table className="min-w-[1880px] w-full text-xs">
          <thead>
            <tr className="border-b border-[#D9CBB8] bg-[#F1E7DA]">
              {[
                "Session",
                "Booked",
                "Booking",
                "Market",
                "Service",
                "Listing",
                "Host",
                "Guest",
                "Email",
                "People",
                "Start",
                "End",
                "Hrs",
                "$/person",
                "Subtotal",
                "Fee",
                "Host payout",
                "Total",
                "Refund",
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
                <td colSpan={20} className="px-4 py-8 text-center text-[#6E5B49]">
                  No bookings match these filters
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} className="border-b border-[#E4D8C8] hover:bg-[#EFE3D3]/50">
                  <td className="px-3 py-2 text-[#6E5B49]">{row.session_date ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{row.booked_at ?? "—"}</td>
                  <td
                    className="px-3 py-2 text-[#2A2118]"
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace' }}
                  >
                    {row.id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2 text-[#6E5B49] whitespace-nowrap">
                    {formatMarket(row.city, row.state)}
                  </td>
                  <td className="px-3 py-2 text-[#6E5B49] whitespace-nowrap">
                    {row.service_type ? formatServiceType(row.service_type) : "—"}
                  </td>
                  <td className="px-3 py-2 text-[#6E5B49] max-w-[140px] truncate">{row.listing_title ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49] max-w-[120px] truncate">{row.host_name ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49] max-w-[120px] truncate">{row.guest_name ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49] max-w-[160px] truncate">{row.guest_email ?? "—"}</td>
                  <td className="px-3 py-2 text-center text-[#2A2118]">{row.guest_count ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{row.start_time ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{row.end_time ?? "—"}</td>
                  <td className="px-3 py-2 text-[#2A2118]">{row.duration_hours ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{formatMoney(row.price_per_person)}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{formatMoney(row.subtotal)}</td>
                  <td className="px-3 py-2 text-[#B45A3D]">{formatMoney(row.service_fee)}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{formatMoney(row.host_payout)}</td>
                  <td className="px-3 py-2 font-medium text-[#2A2118]">{formatMoney(row.total_charged)}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">
                    {Number(row.refunded_amount ?? 0) > 0 ? formatMoney(row.refunded_amount) : "—"}
                  </td>
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
