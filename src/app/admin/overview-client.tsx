"use client"

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
import { AlertTriangle, BellRing, LifeBuoy, MessageSquare, TrendingUp, Users } from "lucide-react"

type DailyPoint = {
  label: string
  bookings: number
  gmv: number
  users: number
  hosts: number
}

type OverviewStats = {
  totalBookings: number
  bookingsLast30: number
  grossGmv: number
  platformFees: number
  activeListings: number
  totalUsers: number
  pendingHost: number
  todaySessions: number
}

type PreviewRow = {
  id: string
  title: string
  subtitle: string
  timestamp: string
}

function money(value: number) {
  return `$${Math.round(value).toLocaleString()}`
}

export function AdminOverviewClient({
  stats,
  dailySeries,
  messagePreviews,
  supportPreviews,
}: {
  stats: OverviewStats
  dailySeries: DailyPoint[]
  messagePreviews: PreviewRow[]
  supportPreviews: PreviewRow[]
}) {
  const cards = [
    { label: "Total bookings", value: String(stats.totalBookings), icon: TrendingUp },
    { label: "Last 30 days", value: String(stats.bookingsLast30), icon: TrendingUp },
    { label: "Gross GMV", value: money(stats.grossGmv), icon: TrendingUp },
    { label: "Platform fees", value: money(stats.platformFees), icon: TrendingUp },
    { label: "Active listings", value: String(stats.activeListings), icon: BellRing },
    { label: "Total users", value: String(stats.totalUsers), icon: Users },
    {
      label: "Awaiting host confirmation",
      value: String(stats.pendingHost),
      icon: AlertTriangle,
      urgent: stats.pendingHost > 0,
    },
    {
      label: "Today's sessions",
      value: String(stats.todaySessions),
      icon: BellRing,
      urgent: stats.todaySessions > 0,
    },
  ]

  return (
    <div className="space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-[#2A2118]">Platform overview</h1>
          <p className="text-sm text-[#6E5B49]">Operational pulse, growth trends, and action queues.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className={`rounded-2xl border p-4 ${
                card.urgent
                  ? "border-[#C75B3A]/40 bg-[#F9E5DD]"
                  : "border-[#D9CBB8] bg-[#FCF8F3]"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="font-serif text-2xl text-[#2A2118]">{card.value}</p>
                <Icon className="size-4 text-[#7F6652]" />
              </div>
              <p className="text-xs text-[#7A6553]">{card.label}</p>
            </div>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3] p-4">
          <div className="mb-3">
            <h2 className="font-medium text-[#2A2118]">Earnings + bookings (14 day)</h2>
            <p className="text-xs text-[#7A6553]">GMV and booking velocity for quick trend checks.</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5D8C8" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#7A6553", fontSize: 11 }} />
                <YAxis tick={{ fill: "#7A6553", fontSize: 11 }} yAxisId="left" />
                <YAxis tick={{ fill: "#7A6553", fontSize: 11 }} yAxisId="right" orientation="right" />
                <Tooltip />
                <Area yAxisId="right" type="monotone" dataKey="gmv" stroke="#C75B3A" fill="#EFD5CB" />
                <Area yAxisId="left" type="monotone" dataKey="bookings" stroke="#6B8A57" fill="#DDE7D5" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3] p-4">
          <div className="mb-3">
            <h2 className="font-medium text-[#2A2118]">New users + hosts (14 day)</h2>
            <p className="text-xs text-[#7A6553]">Acquisition split to monitor marketplace growth balance.</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5D8C8" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#7A6553", fontSize: 11 }} />
                <YAxis tick={{ fill: "#7A6553", fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="users" stroke="#446A8F" fill="#D8E5F0" />
                <Area type="monotone" dataKey="hosts" stroke="#8D6A3D" fill="#EEDFC9" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3] p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="size-4 text-[#7F6652]" />
              <h2 className="font-medium text-[#2A2118]">Message previews</h2>
            </div>
            <Link
              href="/admin/messages"
              className="rounded-full border border-[#CDBCA8] bg-white px-3 py-1 text-xs text-[#2A2118] hover:bg-[#F3EADD]"
            >
              Open inbox
            </Link>
          </div>
          <div className="space-y-2">
            {messagePreviews.length ? (
              messagePreviews.map((row) => (
                <div key={row.id} className="rounded-xl border border-[#E7DACA] bg-white px-3 py-2">
                  <p className="text-sm font-medium text-[#2A2118]">{row.title}</p>
                  <p className="text-xs text-[#6E5B49]">{row.subtitle}</p>
                  <p className="mt-1 text-[11px] text-[#8B7562]">{row.timestamp}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-[#7A6553]">No recent messages.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3] p-4">
          <div className="mb-3 flex items-center gap-2">
            <LifeBuoy className="size-4 text-[#7F6652]" />
            <h2 className="font-medium text-[#2A2118]">Support tickets</h2>
          </div>
          <div className="space-y-2">
            {supportPreviews.length ? (
              supportPreviews.map((row) => (
                <div key={row.id} className="rounded-xl border border-[#E7DACA] bg-white px-3 py-2">
                  <p className="text-sm font-medium text-[#2A2118]">{row.title}</p>
                  <p className="text-xs text-[#6E5B49]">{row.subtitle}</p>
                  <p className="mt-1 text-[11px] text-[#8B7562]">{row.timestamp}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-[#7A6553]">No tickets found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
