"use client"

import { useMemo, useState } from "react"

export type AnalyticsRow = {
  id: string
  date: string
  channel: string
  campaign_id: string
  campaign_name: string
  impressions: number
  clicks: number
  spend: number
  sessions: number
  view_listing: number
  begin_checkout: number
  purchases: number
  revenue: number
  bookings_count: number
  ctr: number
  cvr_session_to_purchase: number
  cvr_checkout_to_purchase: number
  cpa: number
  roas: number
}

type DatePreset = "7d" | "14d" | "30d" | "mtd" | "last_month" | "90d" | "all"

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "14d", label: "Last 14 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "mtd", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "90d", label: "Last 90 days" },
  { key: "all", label: "All time" },
]

const CHANNELS = ["all", "google_ads", "meta", "organic", "direct", "other"] as const

const CHANNEL_LABELS: Record<string, string> = {
  all: "All Channels",
  google_ads: "Google Ads",
  meta: "Meta",
  organic: "Organic",
  direct: "Direct",
  other: "Other",
}

function getDateRange(preset: DatePreset): { start: string | null; end: string | null } {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const dayMs = 24 * 60 * 60 * 1000
  if (preset === "all") return { start: null, end: null }
  if (preset === "7d") {
    return { start: new Date(now.getTime() - 7 * dayMs).toISOString().slice(0, 10), end: today }
  }
  if (preset === "14d") {
    return { start: new Date(now.getTime() - 14 * dayMs).toISOString().slice(0, 10), end: today }
  }
  if (preset === "30d") {
    return { start: new Date(now.getTime() - 30 * dayMs).toISOString().slice(0, 10), end: today }
  }
  if (preset === "mtd") {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), end: today }
  }
  if (preset === "last_month") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last = new Date(now.getFullYear(), now.getMonth(), 0)
    return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) }
  }
  if (preset === "90d") {
    return { start: new Date(now.getTime() - 90 * dayMs).toISOString().slice(0, 10), end: today }
  }
  return { start: null, end: null }
}

function fmt(n: number) {
  return `$${n.toFixed(2)}`
}
function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}
function num(n: number) {
  return n.toLocaleString()
}

type Totals = {
  impressions: number
  clicks: number
  spend: number
  sessions: number
  view_listing: number
  begin_checkout: number
  purchases: number
  revenue: number
  bookings_count: number
}

const emptyTotals: Totals = {
  impressions: 0,
  clicks: 0,
  spend: 0,
  sessions: 0,
  view_listing: 0,
  begin_checkout: 0,
  purchases: 0,
  revenue: 0,
  bookings_count: 0,
}

export function AdminAnalyticsClient({ initialRows }: { initialRows: AnalyticsRow[] }) {
  const [preset, setPreset] = useState<DatePreset>("30d")
  const [channelFilter, setChannelFilter] = useState<string>("all")

  const { start, end } = getDateRange(preset)

  const filtered = useMemo(() => {
    return initialRows.filter((row) => {
      if (channelFilter !== "all" && row.channel !== channelFilter) return false
      if (start && row.date < start) return false
      if (end && row.date > end) return false
      return true
    })
  }, [initialRows, channelFilter, start, end])

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, row) => ({
          impressions: acc.impressions + row.impressions,
          clicks: acc.clicks + row.clicks,
          spend: acc.spend + row.spend,
          sessions: acc.sessions + row.sessions,
          view_listing: acc.view_listing + row.view_listing,
          begin_checkout: acc.begin_checkout + row.begin_checkout,
          purchases: acc.purchases + row.purchases,
          revenue: acc.revenue + row.revenue,
          bookings_count: acc.bookings_count + row.bookings_count,
        }),
        { ...emptyTotals }
      ),
    [filtered]
  )

  const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0
  const cvrSession = totals.sessions > 0 ? totals.purchases / totals.sessions : 0
  const cvrCheckout = totals.begin_checkout > 0 ? totals.purchases / totals.begin_checkout : 0
  const cpa = totals.purchases > 0 ? totals.spend / totals.purchases : 0
  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0

  const funnelSteps = [
    { label: "Impressions", value: totals.impressions, sub: null as string | null },
    { label: "Clicks", value: totals.clicks, sub: totals.impressions > 0 ? `${pct(ctr)} CTR` : null },
    { label: "Sessions", value: totals.sessions, sub: null },
    {
      label: "View listing",
      value: totals.view_listing,
      sub: totals.sessions > 0 ? `${pct(totals.view_listing / totals.sessions)} of sessions` : null,
    },
    {
      label: "Begin checkout",
      value: totals.begin_checkout,
      sub: totals.view_listing > 0 ? `${pct(totals.begin_checkout / totals.view_listing)} of views` : null,
    },
    {
      label: "Purchase",
      value: totals.purchases,
      sub: totals.begin_checkout > 0 ? `${pct(cvrCheckout)} of checkouts` : null,
    },
  ]

  const channelBreakdown = useMemo(() => {
    const map = new Map<string, Totals & { channel: string }>()
    for (const row of filtered) {
      if (row.channel === "all") continue
      if (!map.has(row.channel)) {
        map.set(row.channel, { channel: row.channel, ...emptyTotals })
      }
      const entry = map.get(row.channel)!
      entry.impressions += row.impressions
      entry.clicks += row.clicks
      entry.spend += row.spend
      entry.sessions += row.sessions
      entry.view_listing += row.view_listing
      entry.begin_checkout += row.begin_checkout
      entry.purchases += row.purchases
      entry.revenue += row.revenue
      entry.bookings_count += row.bookings_count
    }
    return Array.from(map.values())
  }, [filtered])

  return (
    <div className="space-y-6 px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-3xl text-[#2A2118]">Analytics</h1>
        <span className="text-xs text-[#6E5B49]">Updated daily at 2am UTC</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPreset(p.key)}
            className={`rounded-full px-3 py-1.5 text-sm transition ${
              preset === p.key
                ? "bg-[#C75B3A] text-white"
                : "border border-[#D9CBB8] text-[#6E5B49] hover:border-[#C75B3A]/40 hover:text-[#2A2118]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {CHANNELS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChannelFilter(c)}
            className={`rounded-full px-2.5 py-1 capitalize ${
              channelFilter === c ? "bg-[#E8DCCB] text-[#2A2118]" : "text-[#6E5B49] hover:text-[#2A2118]"
            }`}
          >
            {CHANNEL_LABELS[c] ?? c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        {[
          { label: "Spend", value: fmt(totals.spend) },
          { label: "Revenue", value: fmt(totals.revenue) },
          { label: "ROAS", value: roas > 0 ? `${roas.toFixed(2)}x` : "—" },
          { label: "CPA", value: cpa > 0 ? fmt(cpa) : "—" },
          { label: "Purchases", value: String(totals.purchases) },
          { label: "Sessions", value: num(totals.sessions) },
          { label: "CTR", value: pct(ctr) },
          { label: "Checkout CVR", value: pct(cvrCheckout) },
          { label: "Session CVR", value: pct(cvrSession) },
          { label: "Bookings", value: String(totals.bookings_count) },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl border border-[#D9CBB8] bg-[#FCF8F3] p-3">
            <p className="font-serif text-xl text-[#2A2118]">{tile.value}</p>
            <p className="mt-0.5 text-xs text-[#6E5B49]">{tile.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3] p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-[#6E5B49]">Conversion funnel</h2>
        <div className="space-y-2">
          {funnelSteps.map((step, i) => {
            const maxVal = funnelSteps[0].value || 1
            const width = Math.max(4, (step.value / maxVal) * 100)
            return (
              <div key={step.label} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-right text-xs text-[#6E5B49]">{step.label}</span>
                <div className="relative h-7 flex-1 overflow-hidden rounded-full bg-[#EDE3D4]">
                  <div
                    className="h-full rounded-full bg-[#C75B3A] transition-all duration-500"
                    style={{ width: `${width}%`, opacity: 1 - i * 0.1 }}
                  />
                </div>
                <span className="w-20 text-xs font-medium text-[#2A2118]">{num(step.value)}</span>
                {step.sub ? (
                  <span className="w-28 text-xs text-[#8A7A6A]">{step.sub}</span>
                ) : (
                  <span className="w-28" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3]">
        <table className="min-w-[900px] w-full text-xs">
          <thead>
            <tr className="border-b border-[#D9CBB8] bg-[#F1E7DA]">
              {[
                "Channel",
                "Spend",
                "Clicks",
                "CTR",
                "Sessions",
                "Checkout",
                "Purchases",
                "Revenue",
                "ROAS",
                "CPA",
                "Checkout CVR",
              ].map((h) => (
                <th key={h} className="px-3 py-3 text-left font-medium uppercase tracking-wide text-[#6E5B49]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {channelBreakdown.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-[#6E5B49]">
                  No data yet — crons will populate this after first run
                </td>
              </tr>
            ) : (
              channelBreakdown.map((row) => {
                const rowCtr = row.impressions > 0 ? row.clicks / row.impressions : 0
                const rowCpa = row.purchases > 0 ? row.spend / row.purchases : 0
                const rowRoas = row.spend > 0 ? row.revenue / row.spend : 0
                const rowCvr = row.begin_checkout > 0 ? row.purchases / row.begin_checkout : 0
                return (
                  <tr key={row.channel} className="border-b border-[#E4D8C8] hover:bg-[#EFE3D3]/50">
                    <td className="px-3 py-2 font-medium capitalize text-[#2A2118]">
                      {CHANNEL_LABELS[row.channel] ?? row.channel}
                    </td>
                    <td className="px-3 py-2 text-[#C75B3A]">{fmt(row.spend)}</td>
                    <td className="px-3 py-2 text-[#6E5B49]">{num(row.clicks)}</td>
                    <td className="px-3 py-2 text-[#6E5B49]">{pct(rowCtr)}</td>
                    <td className="px-3 py-2 text-[#6E5B49]">{num(row.sessions)}</td>
                    <td className="px-3 py-2 text-[#6E5B49]">{num(row.begin_checkout)}</td>
                    <td className="px-3 py-2 font-medium text-[#2A2118]">{num(row.purchases)}</td>
                    <td className="px-3 py-2 text-[#2A2118]">{fmt(row.revenue)}</td>
                    <td className="px-3 py-2 text-[#2A2118]">{rowRoas > 0 ? `${rowRoas.toFixed(2)}x` : "—"}</td>
                    <td className="px-3 py-2 text-[#6E5B49]">{rowCpa > 0 ? fmt(rowCpa) : "—"}</td>
                    <td className="px-3 py-2 text-[#6E5B49]">{pct(rowCvr)}</td>
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
