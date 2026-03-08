"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"

export function StripeConnectBanner({ compact = false }: { compact?: boolean }) {
  const [loading, setLoading] = useState(false)

  async function startOnboarding() {
    setLoading(true)
    try {
      const response = await fetch("/api/stripe/connect", { method: "POST" })
      const data = (await response.json()) as { url?: string; onboardingUrl?: string; error?: string }
      const onboardingUrl = data.url ?? data.onboardingUrl

      if (!response.ok || !onboardingUrl) {
        throw new Error(data.error ?? "Something went wrong. Please try again.")
      }

      window.location.href = onboardingUrl
    } catch {
      window.alert("Something went wrong. Please try again.")
      setLoading(false)
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={startOnboarding}
        disabled={loading}
        className="w-full rounded-xl border border-amber-200 bg-[#FFFBEB] px-4 py-3 text-left text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? "Connecting..." : "⚠️ Connect your bank to receive booking payments →"}
      </button>
    )
  }

  return (
    <div className="rounded-2xl border-[1.5px] border-[#EDE8E2] bg-white p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-[#C75B3A] text-lg text-white">
              💰
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#1A1410]">Connect your bank to get paid</h3>
              <p className="text-sm text-[#6D5E51]">
                Set up payouts to receive earnings directly to your bank account. Takes about 2 minutes.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-[#6D5E51]">
            <span>🔒 Secured by Stripe</span>
            <span>🏦 Direct bank deposit</span>
            <span>📅 Weekly payouts</span>
          </div>
        </div>

        <div className="min-w-[180px] space-y-2">
          <Button className="btn-primary w-full" disabled={loading} onClick={startOnboarding}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Redirecting...
              </>
            ) : (
              "Set up payouts"
            )}
          </Button>
          <a
            href="https://stripe.com/connect"
            target="_blank"
            rel="noreferrer"
            className="block text-center text-sm text-[#7A6A5D] underline-offset-2 hover:underline"
          >
            Learn more
          </a>
        </div>
      </div>
    </div>
  )
}
