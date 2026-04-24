"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type SearchUser = { id: string; full_name: string | null; email: string | null }

type LedgerRow = {
  id: string
  amount: number
  type: string
  description: string
  stripe_invoice_id: string | null
  booking_id: string | null
  created_at: string
}

function formatUsdFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)
}

function formatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

export function AdminCreditsClient() {
  const [search, setSearch] = useState("")
  const [searching, setSearching] = useState(false)
  const [searchHits, setSearchHits] = useState<SearchUser[]>([])
  const [selected, setSelected] = useState<SearchUser | null>(null)
  const [balanceCents, setBalanceCents] = useState<number | null>(null)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [grantOpen, setGrantOpen] = useState(false)
  const [grantDollars, setGrantDollars] = useState("")
  const [grantReason, setGrantReason] = useState("")
  const [grantBusy, setGrantBusy] = useState(false)

  const [promoCode, setPromoCode] = useState("")
  const [promoMode, setPromoMode] = useState<"percent" | "amount">("percent")
  const [promoPercent, setPromoPercent] = useState("10")
  const [promoAmountDollars, setPromoAmountDollars] = useState("25")
  const [promoMax, setPromoMax] = useState("")
  const [promoBusy, setPromoBusy] = useState(false)
  const [promoMessage, setPromoMessage] = useState<string | null>(null)

  const loadLedger = useCallback(async (userId: string) => {
    setLedgerLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/credits/ledger?userId=${encodeURIComponent(userId)}`)
      const data = (await res.json()) as {
        balanceCents?: number
        ledger?: LedgerRow[]
        error?: string
      }
      if (!res.ok) {
        setError(data.error ?? "Failed to load ledger")
        setLedger([])
        setBalanceCents(null)
        return
      }
      setBalanceCents(Number(data.balanceCents ?? 0))
      setLedger(data.ledger ?? [])
    } finally {
      setLedgerLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selected?.id) {
      setLedger([])
      setBalanceCents(null)
      return
    }
    void loadLedger(selected.id)
  }, [selected?.id, loadLedger])

  useEffect(() => {
    const q = search.trim()
    if (q.length < 2) {
      setSearchHits([])
      return
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setSearching(true)
        setError(null)
        try {
          const res = await fetch(`/api/admin/credits/search?q=${encodeURIComponent(q)}`)
          const data = (await res.json()) as { users?: SearchUser[]; error?: string }
          if (!res.ok) {
            setError(data.error ?? "Search failed")
            setSearchHits([])
            return
          }
          setSearchHits(data.users ?? [])
        } finally {
          setSearching(false)
        }
      })()
    }, 320)
    return () => window.clearTimeout(t)
  }, [search])

  async function submitGrant(e: React.FormEvent) {
    e.preventDefault()
    if (!selected?.id) return
    const dollars = Number.parseFloat(grantDollars)
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError("Enter a valid dollar amount.")
      return
    }
    const amountCents = Math.round(dollars * 100)
    const reason = grantReason.trim()
    if (!reason) {
      setError("Reason is required.")
      return
    }
    setGrantBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/credits/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.id, amountCents, reason }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; balanceCents?: number }
      if (!res.ok) {
        setError(data.error ?? "Grant failed")
        return
      }
      setGrantOpen(false)
      setGrantDollars("")
      setGrantReason("")
      if (typeof data.balanceCents === "number") {
        setBalanceCents(data.balanceCents)
      }
      await loadLedger(selected.id)
    } finally {
      setGrantBusy(false)
    }
  }

  async function submitPromo(e: React.FormEvent) {
    e.preventDefault()
    setPromoBusy(true)
    setPromoMessage(null)
    setError(null)
    try {
      const code = promoCode.trim()
      if (code.length < 3) {
        setPromoMessage("Code too short")
        return
      }
      const maxRedemptions = promoMax.trim() ? Number.parseInt(promoMax, 10) : undefined
      const body =
        promoMode === "percent"
          ? {
              code,
              percentOff: Number.parseFloat(promoPercent),
              maxRedemptions: Number.isFinite(maxRedemptions ?? NaN) ? maxRedemptions : undefined,
            }
          : {
              code,
              amountOffCents: Math.round(Number.parseFloat(promoAmountDollars) * 100),
              maxRedemptions: Number.isFinite(maxRedemptions ?? NaN) ? maxRedemptions : undefined,
            }
      const res = await fetch("/api/admin/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        customerFacingCode?: string
      }
      if (!res.ok) {
        setPromoMessage(data.error ?? "Could not create promo code")
        return
      }
      setPromoMessage(`Created: ${data.customerFacingCode ?? code}`)
      setPromoCode("")
    } finally {
      setPromoBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl text-[#2A2118]">Credits &amp; promo codes</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[#6E5B49]">
          Grant Thrml wallet credit, review ledger history, and create Stripe promotion codes (for Checkout sessions
          with codes enabled).
        </p>
      </header>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <section className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6 rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3] p-6">
          <h2 className="text-sm font-semibold text-[#2A2118]">User &amp; ledger</h2>
          <label className="relative block">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-[#8D7864]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or paste user UUID…"
              className="border-[#D9CBB8] bg-white pl-10 text-[#2A2118]"
            />
          </label>
          {searching ? (
            <p className="flex items-center gap-2 text-xs text-[#6E5B49]">
              <Loader2 className="size-3.5 animate-spin text-[#9A4A33]" /> Searching…
            </p>
          ) : null}
          {searchHits.length > 0 ? (
            <ul className="max-h-48 space-y-1 overflow-auto rounded-xl border border-[#D9CBB8] bg-white p-2 text-sm shadow-sm">
              {searchHits.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(u)
                      setSearch(`${u.full_name ?? "User"} · ${u.email ?? u.id}`)
                      setSearchHits([])
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left transition hover:bg-[#F3EADD]"
                  >
                    <span className="block font-medium text-[#2A2118]">{u.full_name ?? "—"}</span>
                    <span className="text-xs text-[#6E5B49]">{u.email ?? u.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {selected ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E8DCCB] pt-4">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.12em] text-[#9A4A33]">SELECTED</p>
                <p className="font-medium text-[#2A2118]">{selected.full_name ?? selected.id}</p>
                <p className="text-xs text-[#6E5B49]">{selected.email}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold tracking-[0.12em] text-[#6E5B49]">BALANCE</p>
                <p className="font-serif text-2xl text-[#2A2118]">
                  {balanceCents == null && ledgerLoading ? "…" : formatUsdFromCents(balanceCents ?? 0)}
                </p>
              </div>
              <Button
                type="button"
                className="bg-[#9A4A33] text-white hover:bg-[#853728]"
                onClick={() => setGrantOpen(true)}
              >
                Grant credit
              </Button>
            </div>
          ) : (
            <p className="text-sm text-[#6E5B49]">Select a user to view balance and ledger.</p>
          )}

          <div className="overflow-x-auto rounded-xl border border-[#D9CBB8] bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-[#E8DCCB] bg-[#F7F0E4] text-[#6E5B49]">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium">Booking</th>
                </tr>
              </thead>
              <tbody>
                {ledgerLoading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-[#6E5B49]">
                      <Loader2 className="mx-auto size-6 animate-spin text-[#9A4A33]" />
                    </td>
                  </tr>
                ) : ledger.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-[#6E5B49]">
                      No ledger rows yet.
                    </td>
                  </tr>
                ) : (
                  ledger.map((row) => (
                    <tr key={row.id} className="border-b border-[#E8DCCB] last:border-0">
                      <td className="px-3 py-2 text-[#6E5B49]">{formatTime(row.created_at)}</td>
                      <td className="px-3 py-2 capitalize text-[#2A2118]">{row.type}</td>
                      <td
                        className={`px-3 py-2 font-medium ${
                          row.amount >= 0 ? "text-emerald-800" : "text-amber-800"
                        }`}
                      >
                        {formatUsdFromCents(row.amount)}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-[#5B4A3A]" title={row.description}>
                        {row.description}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-[#8D7864]">
                        {row.booking_id ? row.booking_id.slice(0, 8) + "…" : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="h-fit space-y-4 rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3] p-6">
          <h2 className="text-sm font-semibold text-[#2A2118]">Create promo code</h2>
          <p className="text-xs leading-relaxed text-[#6E5B49]">
            Creates a Stripe coupon + promotion code. Guests redeem at Checkout when{" "}
            <code className="rounded bg-[#EDE3D4] px-1 text-[#9A4A33]">allow_promotion_codes</code> is on.
          </p>
          <form onSubmit={submitPromo} className="space-y-4">
            <div>
              <Label>Code</Label>
              <Input
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="E.g. WELCOME20"
                className="mt-1 border-[#D9CBB8] bg-white"
              />
            </div>
            <div className="flex gap-3 text-sm text-[#2A2118]">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="promoMode"
                  checked={promoMode === "percent"}
                  onChange={() => setPromoMode("percent")}
                  className="accent-[#9A4A33]"
                />
                Percent off
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="promoMode"
                  checked={promoMode === "amount"}
                  onChange={() => setPromoMode("amount")}
                  className="accent-[#9A4A33]"
                />
                Fixed amount
              </label>
            </div>
            {promoMode === "percent" ? (
              <div>
                <Label>Percent</Label>
                <Input
                  value={promoPercent}
                  onChange={(e) => setPromoPercent(e.target.value)}
                  className="mt-1 border-[#D9CBB8] bg-white"
                />
              </div>
            ) : (
              <div>
                <Label>Amount (USD)</Label>
                <Input
                  value={promoAmountDollars}
                  onChange={(e) => setPromoAmountDollars(e.target.value)}
                  className="mt-1 border-[#D9CBB8] bg-white"
                />
              </div>
            )}
            <div>
              <Label>Max redemptions (optional)</Label>
              <Input
                value={promoMax}
                onChange={(e) => setPromoMax(e.target.value)}
                className="mt-1 border-[#D9CBB8] bg-white"
              />
            </div>
            {promoMessage ? <p className="text-sm text-[#5B4A3A]">{promoMessage}</p> : null}
            <Button
              type="submit"
              disabled={promoBusy}
              className="w-full bg-[#9A4A33] text-white hover:bg-[#853728]"
            >
              {promoBusy ? "Creating…" : "Create in Stripe"}
            </Button>
          </form>
        </div>
      </section>

      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent className="border-[#D9CBB8] bg-[#FCF8F3] text-[#2A2118] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-[#2A2118]">Grant credit</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitGrant} className="space-y-4">
            <div>
              <Label>Amount (USD)</Label>
              <Input
                value={grantDollars}
                onChange={(e) => setGrantDollars(e.target.value)}
                placeholder="25.00"
                className="mt-1 border-[#D9CBB8] bg-white"
              />
            </div>
            <div>
              <Label>Reason (shown in ledger &amp; email)</Label>
              <textarea
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                rows={3}
                className="mt-1 w-full resize-none rounded-md border border-[#D9CBB8] bg-white px-3 py-2 text-sm text-[#2A2118] outline-none focus-visible:ring-2 focus-visible:ring-[#9A4A33]/40"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="border-[#CDBCA8] bg-white text-[#2A2118] hover:bg-[#F3EADD]"
                onClick={() => setGrantOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={grantBusy}
                className="bg-[#9A4A33] text-white hover:bg-[#853728]"
              >
                {grantBusy ? "Granting…" : "Grant"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
