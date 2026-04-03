"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { StripeConnectBanner } from "@/components/host/StripeConnectBanner"
import { formatServiceType, getServiceType } from "@/lib/constants/service-types"

type EarningRow = {
  id: string
  sessionDate: string | null
  totalCharged: number
  hostPayout: number
  serviceFee: number
  listingTitle: string
}

type EarningsBreakdownRow = {
  listingId: string
  listingTitle: string
  serviceType: string
  isActive: boolean
  totalBookings: number
  bookingsThisMonth: number
  totalEarned: number
  earnedThisMonth: number
  avgRating: number | null
  reviewCount: number
}

type RatingSummary = {
  overall: number
  cleanliness: number
  accuracy: number
  communication: number
  value: number
  totalReviews: number
}

type PerListingRating = {
  title: string
  avgRating: number | null
  reviewCount: number
}

type SortOption = "most_earned" | "most_booked" | "highest_rated"

function serviceLabel(value: string) {
  return formatServiceType(value)
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

export function EarningsClient({
  rows,
  breakdownRows,
  overallAverageRating,
  profileTotalReviews,
  ratingSummary,
  perListingRatings,
  stripeConnected,
  stripeOnboardingComplete,
  stripeAccountId,
  nextPayoutDate,
  guestOnly = false,
}: {
  rows: EarningRow[]
  breakdownRows: EarningsBreakdownRow[]
  overallAverageRating: number | null
  profileTotalReviews: number
  ratingSummary: RatingSummary
  perListingRatings: PerListingRating[]
  stripeConnected: boolean
  stripeOnboardingComplete: boolean
  stripeAccountId: string | null
  nextPayoutDate: string | null
  guestOnly?: boolean
}) {
  const [range, setRange] = useState<"monthly" | "weekly">("monthly")
  const [period, setPeriod] = useState<"month" | "all">("all")
  const [sortBy, setSortBy] = useState<SortOption>("most_earned")
  const [openingDashboard, setOpeningDashboard] = useState(false)
  const [stripeStatusError, setStripeStatusError] = useState<string | null>(null)

  async function openStripeDashboard() {
    setStripeStatusError(null)
    setOpeningDashboard(true)
    try {
      const response = await fetch("/api/stripe/connect/dashboard")
      const data = (await response.json()) as { url?: string; error?: string }
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Unable to open Stripe dashboard.")
      }
      window.open(data.url, "_blank", "noopener,noreferrer")
    } catch (error) {
      setStripeStatusError(error instanceof Error ? error.message : "Unable to open Stripe dashboard.")
    } finally {
      setOpeningDashboard(false)
    }
  }

  const showNewHostRating = profileTotalReviews === 0 || overallAverageRating === null

  const totals = useMemo(() => {
    const allTime = rows.reduce((sum, row) => sum + row.hostPayout, 0)
    const month = new Date().getMonth()
    const year = new Date().getFullYear()
    const thisMonth = rows
      .filter((row) => {
        if (!row.sessionDate) return false
        const date = new Date(row.sessionDate)
        return date.getMonth() === month && date.getFullYear() === year
      })
      .reduce((sum, row) => sum + row.hostPayout, 0)

    return {
      allTime,
      thisMonth,
      bookings: rows.length,
    }
  }, [rows])

  const chartData = useMemo(() => {
    if (range === "weekly") {
      const map = new Map<string, number>()
      rows.forEach((row) => {
        if (!row.sessionDate) return
        const d = new Date(row.sessionDate)
        const key = `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleString("en-US", { month: "short" })}`
        map.set(key, (map.get(key) ?? 0) + row.hostPayout)
      })
      return Array.from(map.entries()).map(([label, earnings]) => ({ label, earnings }))
    }
    const map = new Map<string, number>()
    rows.forEach((row) => {
      if (!row.sessionDate) return
      const d = new Date(row.sessionDate)
      const key = `${d.toLocaleString("en-US", { month: "short" })} ${d.getFullYear()}`
      map.set(key, (map.get(key) ?? 0) + row.hostPayout)
    })
    return Array.from(map.entries()).map(([label, earnings]) => ({ label, earnings }))
  }, [range, rows])

  const visibleBreakdownRows = useMemo(() => {
    const sorted = [...breakdownRows]
    sorted.sort((a, b) => {
      if (sortBy === "most_booked") {
        return b.totalBookings - a.totalBookings
      }
      if (sortBy === "highest_rated") {
        const aRating = a.reviewCount > 0 ? (a.avgRating ?? 0) : -1
        const bRating = b.reviewCount > 0 ? (b.avgRating ?? 0) : -1
        return bRating - aRating
      }
      return b.totalEarned - a.totalEarned
    })
    return sorted
  }, [breakdownRows, sortBy])

  const breakdownTotals = useMemo(
    () =>
      visibleBreakdownRows.reduce(
        (acc, row) => ({
          spaces: acc.spaces + 1,
          totalBookings: acc.totalBookings + row.totalBookings,
          bookingsThisMonth: acc.bookingsThisMonth + row.bookingsThisMonth,
          totalEarned: acc.totalEarned + row.totalEarned,
          earnedThisMonth: acc.earnedThisMonth + row.earnedThisMonth,
        }),
        { spaces: 0, totalBookings: 0, bookingsThisMonth: 0, totalEarned: 0, earnedThisMonth: 0 }
      ),
    [visibleBreakdownRows]
  )

  const showGuestEmpty = guestOnly && rows.length === 0 && breakdownRows.length === 0

  return (
    <div className="space-y-5 px-4 py-6 md:px-8 md:py-8">
      <h1 className="font-serif text-3xl text-[#1A1410]">Earnings</h1>

      {!stripeConnected ? (
        <StripeConnectBanner compact payoutsActive={stripeOnboardingComplete} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3">
          <p className="text-sm text-[#166534]">
            💰 Payouts active · Next payout: {nextPayoutDate ?? "Not scheduled yet"}
          </p>
          <button
            type="button"
            onClick={openStripeDashboard}
            disabled={openingDashboard || !stripeAccountId}
            className="text-sm font-medium text-[#166534] underline-offset-2 hover:underline disabled:opacity-60"
          >
            Manage →
          </button>
        </div>
      )}
      {stripeStatusError ? <p className="text-sm text-destructive">{stripeStatusError}</p> : null}

      {showGuestEmpty ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <h2 className="font-serif text-2xl text-[#1A1410]">
            {guestOnly ? "Hosting earnings are ready when you are" : "Earnings will appear here"}
          </h2>
          <p className="mt-2 text-sm text-[#6D5E51]">
            {guestOnly
              ? "You are currently using thrml as a guest. Create a listing anytime to start tracking payouts and analytics."
              : "Once your first booking is confirmed, you&apos;ll see your payouts, history, and analytics."}
          </p>
        </div>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            {[
              { label: "All time", value: formatMoney(totals.allTime) },
              { label: "This month", value: formatMoney(totals.thisMonth) },
              { label: "Bookings", value: String(totals.bookings) },
              {
                label: "Rating",
                value: showNewHostRating ? "New" : `★ ${overallAverageRating.toFixed(1)} (${profileTotalReviews})`,
              },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="font-serif text-3xl text-[#1A1410]">{card.value}</p>
                <p className="text-xs text-[#7A6A5D]">{card.label}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium text-[#1A1410]">Earnings trend</h2>
              <div className="flex rounded-full bg-[#F4ECE3] p-1 text-xs">
                <button
                  onClick={() => setRange("monthly")}
                  className={`rounded-full px-3 py-1 ${range === "monthly" ? "bg-white text-[#1A1410]" : "text-[#7A6A5D]"}`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setRange("weekly")}
                  className={`rounded-full px-3 py-1 ${range === "weekly" ? "bg-white text-[#1A1410]" : "text-[#7A6A5D]"}`}
                >
                  Weekly
                </button>
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EFE4D7" />
                  <XAxis dataKey="label" tick={{ fill: "#7A6A5D", fontSize: 12 }} />
                  <YAxis tickFormatter={(value) => `$${value}`} tick={{ fill: "#7A6A5D", fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number | string | undefined) =>
                      formatMoney(typeof value === "number" ? value : Number(value ?? 0))
                    }
                    labelFormatter={(label) => `${label}`}
                    contentStyle={{ borderRadius: 12, borderColor: "#E7DED3" }}
                  />
                  <Bar dataKey="earnings" fill="#C75B3A" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-medium text-[#1A1410]">Ratings</h2>
            {ratingSummary.totalReviews > 0 ? (
              <>
                <div className="mb-4 rounded-xl border border-[#E9E2D8] bg-[#FAF6F1] p-3">
                  <p className="text-sm text-[#7A6A5D]">Overall rating</p>
                  <p className="font-serif text-3xl text-[#1A1410]">
                    ★ {(overallAverageRating ?? ratingSummary.overall).toFixed(1)}
                  </p>
                  <p className="text-xs text-[#8A7A6D]">{profileTotalReviews} published reviews</p>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  {[
                    { label: "Cleanliness", value: ratingSummary.cleanliness },
                    { label: "Accuracy", value: ratingSummary.accuracy },
                    { label: "Communication", value: ratingSummary.communication },
                    { label: "Value", value: ratingSummary.value },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-[#EEE6DD] px-3 py-2">
                      <div className="mb-1 flex items-center justify-between text-xs text-[#5E4E42]">
                        <span>{item.label}</span>
                        <span>{item.value.toFixed(2)}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#E8DDD1]">
                        <div
                          className="h-1.5 rounded-full bg-[#C75B3A]"
                          style={{ width: `${Math.max(0, Math.min(100, (item.value / 5) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-[#1A1410]">By listing</p>
                  {perListingRatings.map((row) => (
                    <div
                      key={`${row.title}-${row.reviewCount}`}
                      className="flex items-center justify-between rounded-lg border border-[#EEE6DD] px-3 py-2 text-sm"
                    >
                      <span className="truncate pr-3 text-[#2F2620]">{row.title}</span>
                      {row.avgRating !== null ? (
                        <span className="shrink-0 text-[#5D4D41]">
                          ★ {row.avgRating.toFixed(2)} <span className="text-[#8A7A6D]">({row.reviewCount})</span>
                        </span>
                      ) : (
                        <span className="shrink-0 text-[#8A7A6D]">No reviews</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-[#7A6A5D]">No published reviews yet.</p>
            )}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-medium text-[#1A1410]">Breakdown by listing</h2>
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-1 text-xs text-[#6D5E51]">
                <button
                  onClick={() => setPeriod("month")}
                  className={period === "month" ? "font-semibold text-[#1A1410]" : "hover:text-[#1A1410]"}
                >
                  This month
                </button>
                <span>·</span>
                <button
                  onClick={() => setPeriod("all")}
                  className={period === "all" ? "font-semibold text-[#1A1410]" : "hover:text-[#1A1410]"}
                >
                  All time
                </button>
              </div>
              <div className="flex items-center gap-1 text-xs text-[#6D5E51] md:justify-end">
                <span>Sort by:</span>
                <button
                  onClick={() => setSortBy("most_earned")}
                  className={sortBy === "most_earned" ? "font-semibold text-[#1A1410]" : "hover:text-[#1A1410]"}
                >
                  Most earned
                </button>
                <span>·</span>
                <button
                  onClick={() => setSortBy("most_booked")}
                  className={sortBy === "most_booked" ? "font-semibold text-[#1A1410]" : "hover:text-[#1A1410]"}
                >
                  Most booked
                </button>
                <span>·</span>
                <button
                  onClick={() => setSortBy("highest_rated")}
                  className={sortBy === "highest_rated" ? "font-semibold text-[#1A1410]" : "hover:text-[#1A1410]"}
                >
                  Highest rated
                </button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-[#E9E2D8]">
              {visibleBreakdownRows.length === 0 ? (
                <div className="px-6 py-10">
                  <p className="font-serif text-xl text-[#1A1410]">No spaces listed yet</p>
                  <Link
                    href="/dashboard/listings/new"
                    className="mt-2 inline-block text-sm font-medium text-[#C75B3A] hover:underline"
                  >
                    Create your first listing to start earning →
                  </Link>
                </div>
              ) : (
                <table className="min-w-[920px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#F0EBE4] bg-white text-left text-[12px] font-semibold uppercase tracking-[0.8px] text-[#8C7E72]">
                      <th className="px-4 py-3">Space</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Bookings</th>
                      <th className="px-4 py-3">Earned</th>
                      <th className="px-4 py-3">Rating</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleBreakdownRows.map((row, index) => {
                      const primaryBookings = period === "month" ? row.bookingsThisMonth : row.totalBookings
                      const primaryEarned = period === "month" ? row.earnedThisMonth : row.totalEarned
                      const secondaryEarned = period === "month" ? row.totalEarned : row.earnedThisMonth
                      return (
                        <tr
                          key={`${row.listingId}-${row.listingTitle}`}
                          className={`border-b border-[#F0EBE4] text-[#1A1410] ${index % 2 === 0 ? "bg-white" : "bg-[#FAFAF8]"}`}
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium">{row.listingTitle}</p>
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#F3ECE3] px-2 py-0.5 text-xs text-[#6D5E51]">
                              <span>{getServiceType(row.serviceType)?.emoji ?? "✨"}</span>
                              <span>{serviceLabel(row.serviceType)}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-2 text-sm">
                              <span
                                className={`size-2 rounded-full ${row.isActive ? "bg-[#31A24C]" : "bg-[#9A948C]"}`}
                                aria-hidden
                              />
                              <span>{row.isActive ? "Live" : "Paused"}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <p className="font-semibold">{primaryBookings}</p>
                            <p className="text-xs text-[#7A6A5D]">
                              {row.totalBookings} total · {row.bookingsThisMonth} this month
                            </p>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <p className="font-semibold">{formatMoney(primaryEarned)}</p>
                            <p className="text-xs text-[#C75B3A]">{`${formatMoney(secondaryEarned)} ${period === "month" ? "all time" : "this month"}`}</p>
                          </td>
                          <td className="px-4 py-3">
                            {row.reviewCount > 0 && row.avgRating !== null ? (
                              <span className="inline-flex items-center gap-1">
                                <span className="text-[#C75B3A]">★</span>
                                <span>{row.avgRating.toFixed(1)}</span>
                                <span className="text-xs text-[#7A6A5D]">({row.reviewCount})</span>
                              </span>
                            ) : (
                              <span className="text-[#7A6A5D]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/listings/${row.listingId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-medium text-[#C75B3A] hover:underline"
                            >
                              View listing →
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="sticky bottom-0 border-t border-[#E9DECF] bg-[#F7F3EE] text-[#1A1410]">
                      <td className="px-4 py-3 font-medium">{`Total across ${breakdownTotals.spaces} spaces`}</td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3">
                        <p className="font-semibold">
                          {period === "month" ? breakdownTotals.bookingsThisMonth : breakdownTotals.totalBookings}
                        </p>
                        <p className="text-xs text-[#7A6A5D]">
                          {breakdownTotals.totalBookings} total · {breakdownTotals.bookingsThisMonth} this month
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">
                          {formatMoney(period === "month" ? breakdownTotals.earnedThisMonth : breakdownTotals.totalEarned)}
                        </p>
                        <p className="text-xs text-[#C75B3A]">
                          {period === "month"
                            ? `${formatMoney(breakdownTotals.totalEarned)} all time`
                            : `${formatMoney(breakdownTotals.earnedThisMonth)} this month`}
                        </p>
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </section>
        </>
      )}

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-medium text-[#1A1410]">Payouts</h2>
        {stripeConnected ? (
          <p className="mt-1 text-sm text-[#6D5E51]">Next payout is automatically scheduled via Stripe.</p>
        ) : (
          <p className="mt-1 text-sm text-[#6D5E51]">Connect your bank to start receiving payouts.</p>
        )}
      </section>
    </div>
  )
}
