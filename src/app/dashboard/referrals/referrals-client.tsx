"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Copy, Gift, Loader2, Mail, MessageSquare } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type EarningRow = {
  id: string
  amount_cents: number
  status: string
  created_at: string
  booking_id: string | null
  referral_id: string | null
  referredFirstName: string | null
  bookingTotalCents: number | null
}

type StatsPayload = {
  code?: string
  referralLink?: string
  totalReferrals?: number
  convertedReferrals?: number
  totalEarnedCents?: number
  walletBalanceCents?: number
  earnings?: EarningRow[]
  error?: string
}

function formatMoneyFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100)
}

function formatDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export function ReferralsClient() {
  const [data, setData] = useState<StatsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle")

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/referral/stats")
    const payload = (await res.json()) as StatsPayload
    setData(res.ok ? payload : { error: payload.error ?? "Unable to load referrals." })
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function copyLink() {
    const link = data?.referralLink
    if (!link || !navigator.clipboard) return
    await navigator.clipboard.writeText(link)
    setCopyState("copied")
    window.setTimeout(() => setCopyState("idle"), 2000)
  }

  async function shareNative() {
    const link = data?.referralLink
    if (!link) return
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Book wellness on thrml",
          text: "Use my link for private saunas, cold plunges, and more.",
          url: link,
        })
      } catch {
        // dismissed share sheet
      }
    }
  }

  const smsHref = data?.referralLink
    ? `sms:?body=${encodeURIComponent(`Book wellness on thrml: ${data.referralLink}`)}`
    : null
  const mailHref = data?.referralLink
    ? `mailto:?subject=${encodeURIComponent("Join me on thrml")}&body=${encodeURIComponent(
        `Use my referral link:\n${data.referralLink}`
      )}`
    : null

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 py-12">
        <Loader2 className="size-8 animate-spin text-[#C75B3A]" />
      </div>
    )
  }

  if (data?.error) {
    return (
      <div className="px-4 py-12 md:px-8">
        <p className="text-sm text-destructive">{data.error}</p>
        <Button className="mt-4" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    )
  }

  const wallet = Number(data?.walletBalanceCents ?? 0)
  const totalEarned = Number(data?.totalEarnedCents ?? 0)
  const earnings = data?.earnings ?? []

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10 md:px-8">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-[#FFF0E9] p-3 text-[#C75B3A]">
          <Gift className="size-7" />
        </div>
        <div>
          <h1 className="type-h2 text-[#1A1410]">Referrals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Earn credit when friends complete their first booking. Apply balance at checkout.
          </p>
        </div>
      </div>

      <Card className="card-base border-[#E7DED3]">
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm font-medium text-[#1A1410]">Your balance</p>
          <p className="text-3xl font-semibold tracking-tight text-[#1A1410]">{formatMoneyFromCents(wallet)}</p>
          <p className="text-xs text-muted-foreground">Referral credit applies toward future bookings (see checkout).</p>
        </CardContent>
      </Card>

      <Card className="card-base border-[#E7DED3]">
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm font-medium text-[#1A1410]">Your link</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="block flex-1 truncate rounded-lg bg-[#F7F3EE] px-3 py-2 text-xs text-[#2A2118]">
              {data?.referralLink ?? "—"}
            </code>
            <Button type="button" variant="outline" className="shrink-0 gap-2" onClick={() => void copyLink()}>
              {copyState === "copied" ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copyState === "copied" ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {typeof navigator !== "undefined" && "share" in navigator ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => void shareNative()}>
                Share
              </Button>
            ) : null}
            {smsHref ? (
              <Button type="button" variant="secondary" size="sm" asChild>
                <a href={smsHref} className="gap-1">
                  <MessageSquare className="size-4" />
                  SMS
                </a>
              </Button>
            ) : null}
            {mailHref ? (
              <Button type="button" variant="secondary" size="sm" asChild>
                <a href={mailHref} className="gap-1">
                  <Mail className="size-4" />
                  Email
                </a>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[#E7DED3] bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Invited</p>
          <p className="mt-1 text-2xl font-semibold text-[#1A1410]">{data?.totalReferrals ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#E7DED3] bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Converted</p>
          <p className="mt-1 text-2xl font-semibold text-[#1A1410]">{data?.convertedReferrals ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#E7DED3] bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total earned</p>
          <p className="mt-1 text-2xl font-semibold text-[#1A1410]">{formatMoneyFromCents(totalEarned)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#E7DED3] bg-[#FCFAF7] p-6">
        <h2 className="text-sm font-semibold text-[#1A1410]">How it works</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[#5D4E42]">
          <li>Share your personal link with friends who love wellness.</li>
          <li>They sign up and book a session on thrml.</li>
          <li>When their first booking is confirmed, you earn credit toward your next visit.</li>
        </ol>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-[#1A1410]">Earnings history</h2>
        <div className="overflow-hidden rounded-xl border border-[#E7DED3] bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#EFE6DC] bg-[#FAF8F4] text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Guest</th>
                <th className="px-4 py-3">Booking</th>
                <th className="px-4 py-3">Reward</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {earnings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No earnings yet — share your link to get started.
                  </td>
                </tr>
              ) : (
                earnings.map((row) => (
                  <tr key={row.id} className="border-b border-[#F5EFE8] last:border-0">
                    <td className="px-4 py-3 text-[#2A2118]">{formatDate(row.created_at)}</td>
                    <td className="px-4 py-3 text-[#2A2118]">{row.referredFirstName ?? "—"}</td>
                    <td className="px-4 py-3 text-[#2A2118]">
                      {row.bookingTotalCents != null ? formatMoneyFromCents(row.bookingTotalCents) : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-[#1A1410]">
                      {formatMoneyFromCents(Number(row.amount_cents ?? 0))}
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{row.status.replace(/_/g, " ")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
