"use client"

import { Download } from "lucide-react"
import { useState } from "react"

const EXPORTS = [
  { type: "bookings", label: "Bookings", hint: "Every booking with fees, refunds, credits and Stripe IDs (by session date)" },
  { type: "payouts", label: "Host payouts", hint: "Confirmed and completed bookings with host payout and transfer (by session date)" },
  { type: "ledger", label: "Finance ledger", hint: "Every money event from Stripe: charges, refunds, transfers, fees (by event date)" },
  { type: "users", label: "Users", hint: "Everyone who signed up, with host status, listings and bookings (by sign-up date)" },
] as const

/** Admin CSV downloads. Leave dates empty for all-time. */
export function DataExports() {
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const href = (type: string) => {
    const params = new URLSearchParams()
    if (from) params.set("from", from)
    if (to) params.set("to", to)
    const query = params.toString()
    return `/api/admin/export/${type}${query ? `?${query}` : ""}`
  }

  return (
    <section className="rounded-xl border border-[#DCCDBA] bg-[#F3EADD] p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-xl text-[#2A2118]">Data exports</h2>
          <p className="mt-1 text-sm text-[#5B4A3A]">CSV files that open in Excel or Google Sheets. Leave the dates empty for all time.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1 text-xs text-[#5B4A3A]">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-[#DCCDBA] bg-white px-2 py-1.5 text-sm text-[#2A2118]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#5B4A3A]">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-[#DCCDBA] bg-white px-2 py-1.5 text-sm text-[#2A2118]"
            />
          </label>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {EXPORTS.map((item) => (
          <a
            key={item.type}
            href={href(item.type)}
            className="group rounded-lg border border-[#DCCDBA] bg-white/60 p-4 transition hover:border-[#9A4A33]"
          >
            <span className="flex items-center justify-between gap-2 text-sm font-medium text-[#2A2118]">
              {item.label}
              <Download className="size-4 text-[#9A4A33]" aria-hidden />
            </span>
            <span className="mt-1 block text-xs text-[#5B4A3A]">{item.hint}</span>
          </a>
        ))}
      </div>
    </section>
  )
}
