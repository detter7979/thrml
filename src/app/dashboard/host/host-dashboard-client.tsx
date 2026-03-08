"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertCircle, CheckCircle2, Loader2, Wallet } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Transaction = {
  id: string
  sessionDate: string | null
  createdAt: string | null
  amount: number
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value: string | null) {
  if (!value) return "Unknown date"
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(value)
  )
}

export function HostDashboardClient({
  stripeQueryState,
  initialStripeConnected,
  initialHasStripeAccount,
  lifetimeEarnings,
  thisMonthEarnings,
  pendingPayout,
  recentTransactions,
}: {
  stripeQueryState: string | null
  initialStripeConnected: boolean
  initialHasStripeAccount: boolean
  lifetimeEarnings: number
  thisMonthEarnings: number
  pendingPayout: number
  recentTransactions: Transaction[]
}) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false)
  const [stripeConnected, setStripeConnected] = useState(initialStripeConnected)
  const [hasStripeAccount, setHasStripeAccount] = useState(initialHasStripeAccount)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (stripeQueryState !== "success" && stripeQueryState !== "refresh") return

    const check = async () => {
      setIsRefreshingStatus(true)
      try {
        const response = await fetch("/api/stripe/connect", { method: "GET" })
        const data = (await response.json()) as {
          connected?: boolean
          stripeAccountId?: string | null
          error?: string
        }

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to refresh payout status.")
        }

        setStripeConnected(Boolean(data.connected))
        setHasStripeAccount(Boolean(data.stripeAccountId))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to refresh payout status.")
      } finally {
        setIsRefreshingStatus(false)
      }
    }

    void check()
  }, [stripeQueryState])

  const stats = useMemo(
    () => [
      { label: "Lifetime earnings", value: formatMoney(lifetimeEarnings) },
      { label: "This month", value: formatMoney(thisMonthEarnings) },
      { label: "Pending payout", value: formatMoney(pendingPayout) },
    ],
    [lifetimeEarnings, pendingPayout, thisMonthEarnings]
  )

  async function handleConnect() {
    setError(null)
    setIsConnecting(true)

    try {
      const response = await fetch("/api/stripe/connect", { method: "POST" })
      const data = (await response.json()) as { onboardingUrl?: string; error?: string }

      if (!response.ok || !data.onboardingUrl) {
        throw new Error(data.error ?? "Unable to start Stripe onboarding.")
      }

      window.location.href = data.onboardingUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start Stripe onboarding.")
      setIsConnecting(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <header className="space-y-1">
        <h1 className="type-h1">Host dashboard</h1>
        <p className="type-label">Track payouts and recent completed bookings.</p>
      </header>

      {!stripeConnected ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 text-amber-700" />
              <div className="space-y-1">
                <p className="font-medium text-amber-900">Set up payouts</p>
                <p className="text-sm text-amber-800">
                  {hasStripeAccount
                    ? "Finish Stripe onboarding to publish and get paid."
                    : "Connect Stripe to accept bookings and receive payouts."}
                </p>
              </div>
            </div>
            <Button className="btn-primary" onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Redirecting...
                </>
              ) : (
                "Set up payouts"
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-300 bg-emerald-50">
          <CardContent className="flex items-center gap-2 pt-6 text-emerald-800">
            <CheckCircle2 className="size-5" />
            <span className="text-sm font-medium">Stripe payouts connected. Your host earnings dashboard is active.</span>
          </CardContent>
        </Card>
      )}

      {isRefreshingStatus ? (
        <p className="text-sm text-muted-foreground">Refreshing Stripe connection status...</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="card-base">
            <CardContent className="space-y-1 pt-6">
              <p className="type-label">{stat.label}</p>
              <p className="type-price">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Last 10 transactions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentTransactions.length ? (
            recentTransactions.map((txn) => (
              <div key={txn.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Booking {txn.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">
                    Session: {formatDate(txn.sessionDate)} • Paid: {formatDate(txn.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1 font-medium">
                  <Wallet className="size-4 text-muted-foreground" />
                  {formatMoney(txn.amount)}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No completed bookings yet.</p>
          )}
        </CardContent>
      </Card>

      <div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/host/new">Create a new listing</Link>
        </Button>
      </div>
    </div>
  )
}
