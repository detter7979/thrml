import Link from "next/link"
import { Wallet } from "lucide-react"

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * The host's earnings at a glance. Warm blush rather than a dark panel: it still stands out from
 * the white cards around it, in the brand's terracotta family.
 */
export function EarningsCard({ thisMonth, allTime }: { thisMonth: number; allTime: number }) {
  const hasEarnings = thisMonth > 0 || allTime > 0
  return (
    <Link
      href="/dashboard/earnings"
      className="block rounded-3xl border border-[#F0CDBA] bg-gradient-to-br from-[#FFE8DC] to-[#FBF1EA] p-5 text-[#1A1410] transition-colors hover:border-[#E6B49B]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#A8472B]">
          <Wallet className="size-4" />
          <p className="text-xs font-medium tracking-[0.14em] uppercase">Earnings this month</p>
        </div>
        <span className="text-sm font-medium text-[#A8472B]">Details →</span>
      </div>
      <p className="mt-2 font-serif text-4xl">{money(thisMonth)}</p>
      <p className="mt-1 text-sm text-[#7A6355]">
        All time {money(allTime)}
        {hasEarnings ? null : " · Activate a listing to start earning."}
      </p>
    </Link>
  )
}
