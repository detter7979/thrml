"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ArrowUpRight,
  ExternalLink,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import { formatServiceType } from "@/lib/constants/service-types"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type FinancePeriod = "7d" | "mtd" | "30d" | "90d" | "ytd"

type DashboardPayload = {
  period: FinancePeriod
  range: { start: string; end: string }
  asOf: string
  marketplace: {
    bookings: number
    gmv: number
    grossTake: number
    cashTake: number
    promoCredits: number
    refunds: number
    chargebacks: number
    netRevenue: number
    hostPayouts: number
    avgOrderSize: number
    avgGuestsPerOrder: number
    takeRate: number
  }
  supply: {
    newHosts: number
    newListings: number
    totalListings: number
    totalHosts: number
  }
  ads: {
    spend: number
    hostClicks: number
    hostOnboarding: number
    listingsCreated: number
    purchases: number
    roas: number | null
    cpa: number | null
  }
  expenses: {
    fixedOpEx: number
    adHoc: number
    adSpend: number
    total: number
    lineItems: { label: string; category: string; amount: number; source: string }[]
    fixedByCategory: Record<string, number>
  }
  pnl: {
    netContribution: number
    profitMargin: number | null
    breakevenBookingsNeeded: number | null
    breakevenGmvNeeded: number | null
    avgCashTakePerBooking: number
  }
  breakdown: {
    byServiceType: {
      key: string
      label: string
      bookings: number
      gmv: number
      grossTake: number
      netRevenue: number
      avgOrderSize: number
      avgGuests: number
    }[]
    byGeo: {
      key: string
      label: string
      bookings: number
      gmv: number
      grossTake: number
      netRevenue: number
      avgOrderSize: number
      avgGuests: number
    }[]
  }
  dailySeries: { date: string; bookings: number; gmv: number; netRevenue: number; adSpend: number }[]
  sources: {
    financeTrackerSheetId: string
    financeTrackerUrl: string
    masterReportId: string | null
    costsSyncedAt: string | null
    sheetsAvailable: boolean
  }
}

const PERIOD_LABELS: Record<FinancePeriod, string> = {
  "7d": "Last 7 days",
  mtd: "Month to date",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  ytd: "Year to date",
}

function money(value: number | null | undefined, signed = false) {
  const n = Number(value ?? 0)
  const prefix = signed && n < 0 ? "-" : ""
  return `${prefix}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function pct(value: number | null | undefined) {
  return `${(Number(value ?? 0) * 100).toFixed(1)}%`
}

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

async function fetchDashboard(period: FinancePeriod) {
  const res = await fetch(`/api/admin/finance/dashboard?period=${period}`, { cache: "no-store" })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load finance dashboard")
  return json as DashboardPayload
}

export function AdminFinanceClient() {
  const [period, setPeriod] = useState<FinancePeriod>("mtd")
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: FinancePeriod) => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchDashboard(p))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(period)
  }, [load, period])

  async function syncSheets() {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/finance/sync", { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Sync failed")
      await load(period)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed")
    } finally {
      setSyncing(false)
    }
  }

  const chartData = useMemo(
    () =>
      (data?.dailySeries ?? []).map((d) => ({
        label: d.date.slice(5),
        gmv: d.gmv,
        net: d.netRevenue,
        adSpend: d.adSpend,
      })),
    [data]
  )

  const profitPositive = (data?.pnl.netContribution ?? 0) >= 0

  return (
    <div className="space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#9A4A33]">
            Finance command center
          </p>
          <h1 className="font-serif text-3xl text-[#2A2118]">Platform P&amp;L</h1>
          <p className="mt-1 text-sm text-[#5B4A3A]">
            {data
              ? `${PERIOD_LABELS[data.period]} · ${fmtDate(data.range.start)} – ${fmtDate(data.range.end)} (through yesterday)`
              : "Loading…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as FinancePeriod)}>
            <SelectTrigger className="w-[160px] border-[#DCCDBA] bg-[#F3EADD]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as FinancePeriod[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {PERIOD_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="border-[#DCCDBA] bg-[#F3EADD]"
            onClick={() => void load(period)}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            className="bg-[#2A2118] text-[#F3EADD] hover:bg-[#1F170F]"
            onClick={() => void syncSheets()}
            disabled={syncing}
          >
            {syncing ? "Syncing…" : "Sync sheets"}
          </Button>
          {data?.sources.financeTrackerUrl && (
            <Button asChild variant="outline" className="border-[#DCCDBA] bg-[#F3EADD]">
              <a href={data.sources.financeTrackerUrl} target="_blank" rel="noreferrer">
                Finance Tracker
                <ExternalLink className="ml-2 size-4" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {!data?.sources.sheetsAvailable && !loading && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Sheet costs unavailable — check `GOOGLE_SERVICE_ACCOUNT_JSON` or use Sync sheets after configuring credentials.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Net platform revenue", value: money(data?.marketplace.netRevenue), icon: TrendingUp },
          {
            label: "Net contribution",
            value: money(data?.pnl.netContribution, true),
            icon: profitPositive ? TrendingUp : TrendingDown,
            urgent: !profitPositive,
          },
          { label: "Gross GMV", value: money(data?.marketplace.gmv), icon: TrendingUp },
          { label: "Take rate", value: pct(data?.marketplace.takeRate), icon: TrendingUp },
          { label: "Bookings", value: String(data?.marketplace.bookings ?? 0), icon: TrendingUp },
          { label: "Avg order size", value: money(data?.marketplace.avgOrderSize), icon: TrendingUp },
          {
            label: "Avg guests / order",
            value: (data?.marketplace.avgGuestsPerOrder ?? 0).toFixed(1),
            icon: TrendingUp,
          },
          { label: "Total ad spend", value: money(data?.ads.spend), icon: TrendingDown },
        ].map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className={`rounded-xl border border-[#DCCDBA] bg-[#F3EADD] p-4 ${card.urgent ? "ring-1 ring-amber-400" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-[#9A4A33]">{card.label}</p>
                <Icon className="size-4 text-[#9A4A33]" />
              </div>
              <p className="mt-2 font-serif text-2xl text-[#2A2118]">{loading ? "…" : card.value}</p>
            </div>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-[#DCCDBA] bg-[#F3EADD] p-5">
          <h2 className="font-serif text-xl text-[#2A2118]">Supply &amp; acquisition</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {[
              ["New hosts", data?.supply.newHosts],
              ["New listings", data?.supply.newListings],
              ["Total listings", data?.supply.totalListings],
              ["Total hosts", data?.supply.totalHosts],
              ["Host clicks (ads)", data?.ads.hostClicks],
              ["Onboarding (ads)", data?.ads.hostOnboarding],
              ["Listings (ads)", data?.ads.listingsCreated],
              ["Purchases (ads)", data?.ads.purchases],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-[#EDE3D4] px-3 py-2">
                <p className="text-[#9A4A33]">{label}</p>
                <p className="text-lg font-medium text-[#2A2118]">{loading ? "…" : value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[#DCCDBA] bg-[#F3EADD] p-5">
          <h2 className="font-serif text-xl text-[#2A2118]">Breakeven &amp; unit economics</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between border-b border-[#DCCDBA] pb-2">
              <span className="text-[#5B4A3A]">ROAS (net rev ÷ ad spend)</span>
              <span className="font-medium">{data?.ads.roas != null ? `${data.ads.roas.toFixed(2)}×` : "—"}</span>
            </div>
            <div className="flex justify-between border-b border-[#DCCDBA] pb-2">
              <span className="text-[#5B4A3A]">CPA (ad spend ÷ bookings)</span>
              <span className="font-medium">{data?.ads.cpa != null ? money(data.ads.cpa) : "—"}</span>
            </div>
            <div className="flex justify-between border-b border-[#DCCDBA] pb-2">
              <span className="text-[#5B4A3A]">Avg cash take / booking</span>
              <span className="font-medium">{money(data?.pnl.avgCashTakePerBooking)}</span>
            </div>
            <div className="flex justify-between border-b border-[#DCCDBA] pb-2">
              <span className="text-[#5B4A3A]">Bookings to breakeven</span>
              <span className="font-medium">
                {data?.pnl.breakevenBookingsNeeded == null
                  ? profitPositive
                    ? "0 (profitable)"
                    : "—"
                  : data.pnl.breakevenBookingsNeeded}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#5B4A3A]">GMV to breakeven</span>
              <span className="font-medium">
                {data?.pnl.breakevenGmvNeeded != null ? money(data.pnl.breakevenGmvNeeded) : "—"}
              </span>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-[#DCCDBA] bg-[#F3EADD] p-5">
        <h2 className="font-serif text-xl text-[#2A2118]">P&amp;L by line item</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#DCCDBA] text-left text-[#9A4A33]">
                <th className="py-2 pr-4">Line item</th>
                <th className="py-2 pr-4 text-right">Amount</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Gross platform take", data?.marketplace.grossTake, "Guest + host fees"],
                ["Cash platform revenue", data?.marketplace.cashTake, "Before refunds"],
                ["Refunds & chargebacks", -(Number(data?.marketplace.refunds ?? 0) + Number(data?.marketplace.chargebacks ?? 0)), "Ledger"],
                ["Net platform revenue", data?.marketplace.netRevenue, "After refunds"],
                ["Promo credits", -(data?.marketplace.promoCredits ?? 0), "Platform subsidy"],
                ["Fixed OpEx", -(data?.expenses.fixedOpEx ?? 0), "Fixed Costs tab"],
                ["Ad hoc / variable", -(data?.expenses.adHoc ?? 0), "Ad Hoc Costs tab"],
                ["Paid media", -(data?.expenses.adSpend ?? 0), "Platform Data · MTD filtered"],
                ["Net contribution", data?.pnl.netContribution, "Bottom line"],
              ].map(([label, amount, note]) => (
                <tr key={String(label)} className="border-b border-[#DCCDBA]/60">
                  <td className="py-2 pr-4 text-[#2A2118]">{label}</td>
                  <td className="py-2 pr-4 text-right font-medium">{money(Number(amount))}</td>
                  <td className="py-2 text-[#5B4A3A]">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {chartData.length > 0 && (
        <section className="rounded-xl border border-[#DCCDBA] bg-[#F3EADD] p-5">
          <h2 className="font-serif text-xl text-[#2A2118]">Daily trend</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DCCDBA" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Area type="monotone" dataKey="gmv" stroke="#9A4A33" fill="#E8DCCB" name="GMV" />
                <Area type="monotone" dataKey="net" stroke="#2A2118" fill="#DCCDBA" name="Net rev" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownTable
          title="By service type"
          rows={(data?.breakdown.byServiceType ?? []).map((r) => ({
            ...r,
            label: r.key === "unknown" ? "Unknown" : formatServiceType(r.key),
          }))}
          loading={loading}
        />
        <BreakdownTable title="By market (geo)" rows={data?.breakdown.byGeo ?? []} loading={loading} />
      </div>

      <section className="rounded-xl border border-[#DCCDBA] bg-[#F3EADD] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-xl text-[#2A2118]">Expense detail (from Finance Tracker)</h2>
          <Link href="/admin/earnings" className="inline-flex items-center text-sm text-[#9A4A33] hover:underline">
            Booking-level earnings
            <ArrowUpRight className="ml-1 size-4" />
          </Link>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#DCCDBA] text-left text-[#9A4A33]">
                <th className="py-2 pr-4">Item</th>
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Source</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(data?.expenses.lineItems ?? []).slice(0, 20).map((row, i) => (
                <tr key={`${row.label}-${i}`} className="border-b border-[#DCCDBA]/60">
                  <td className="py-2 pr-4">{row.label}</td>
                  <td className="py-2 pr-4">{row.category}</td>
                  <td className="py-2 pr-4 capitalize">{row.source.replace("_", " ")}</td>
                  <td className="py-2 text-right">{money(row.amount)}</td>
                </tr>
              ))}
              {!loading && (data?.expenses.lineItems.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-[#5B4A3A]">
                    No expense line items loaded. Sync sheets or add costs on the Finance Tracker.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[#5B4A3A]">
          CSV bank/card import: drop files in <code className="rounded bg-[#EDE3D4] px-1">data/finance-statements/</code>{" "}
          (auto-mapping coming next).
        </p>
      </section>
    </div>
  )
}

function BreakdownTable({
  title,
  rows,
  loading,
}: {
  title: string
  rows: DashboardPayload["breakdown"]["byServiceType"]
  loading: boolean
}) {
  return (
    <section className="rounded-xl border border-[#DCCDBA] bg-[#F3EADD] p-5">
      <h2 className="font-serif text-xl text-[#2A2118]">{title}</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#DCCDBA] text-left text-[#9A4A33]">
              <th className="py-2 pr-3">Segment</th>
              <th className="py-2 pr-3 text-right">Bookings</th>
              <th className="py-2 pr-3 text-right">GMV</th>
              <th className="py-2 pr-3 text-right">Net rev</th>
              <th className="py-2 text-right">Avg order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-[#DCCDBA]/60">
                <td className="py-2 pr-3">{row.label}</td>
                <td className="py-2 pr-3 text-right">{row.bookings}</td>
                <td className="py-2 pr-3 text-right">{money(row.gmv)}</td>
                <td className="py-2 pr-3 text-right">{money(row.netRevenue)}</td>
                <td className="py-2 text-right">{money(row.avgOrderSize)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-[#5B4A3A]">
                  No bookings in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
