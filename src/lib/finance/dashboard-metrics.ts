import type { SupabaseClient } from "@supabase/supabase-js"

import {
  cashPlatformTakeCents,
  dollarsFromCents,
  grossPlatformTakeCents,
  promoCreditsAppliedCents,
} from "@/lib/finance/booking-economics"
import { bookingRefundedDollars } from "@/lib/finance/load-earnings-bookings"
import {
  readFinanceTrackerCosts,
  type TrackerCostsSummary,
} from "@/lib/finance/read-tracker-costs"
import {
  resolveFinancePeriodRange,
  yesterdayIso,
  type FinancePeriod,
} from "@/lib/finance/period-utils"
import { resolveFinanceTrackerSheetId } from "@/lib/finance/sheet-config"
import type { BookingEconomicsRow } from "@/lib/finance/types"

type AdminClient = SupabaseClient

export type FinanceBreakdownRow = {
  key: string
  label: string
  bookings: number
  gmv: number
  grossTake: number
  netRevenue: number
  avgOrderSize: number
  avgGuests: number
}

export type FinanceDailyPoint = {
  date: string
  bookings: number
  gmv: number
  netRevenue: number
  adSpend: number
}

export type FinanceDashboardPayload = {
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
  ads: TrackerCostsSummary["adMetrics"] & {
    spend: number
    roas: number | null
    cpa: number | null
  }
  expenses: {
    fixedOpEx: number
    adHoc: number
    adSpend: number
    total: number
    lineItems: TrackerCostsSummary["lineItems"]
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
    byServiceType: FinanceBreakdownRow[]
    byGeo: FinanceBreakdownRow[]
  }
  dailySeries: FinanceDailyPoint[]
  sources: {
    financeTrackerSheetId: string
    financeTrackerUrl: string
    masterReportId: string | null
    costsSyncedAt: string | null
    sheetsAvailable: boolean
  }
}

const BOOKING_SELECT =
  "id, listing_id, guest_count, total_charged, host_payout, guest_fee, host_fee, service_fee, subtotal, referral_credit_applied_cents, user_credit_applied_cents, status, created_at"

type BookingWithListing = BookingEconomicsRow & {
  id: string
  listing_id: string | null
  guest_count: number | null
  status: string | null
  created_at: string | null
  listings?: {
    service_type: string | null
    city: string | null
    state: string | null
    location_city: string | null
    location_state: string | null
  } | null
}

function marketLabel(listing: BookingWithListing["listings"]) {
  if (!listing) return "Unknown"
  const city =
    (typeof listing.city === "string" && listing.city) ||
    (typeof listing.location_city === "string" && listing.location_city) ||
    ""
  const state =
    (typeof listing.state === "string" && listing.state) ||
    (typeof listing.location_state === "string" && listing.location_state) ||
    ""
  if (city && state) return `${city}, ${state}`
  return city || state || "Unknown"
}

function serviceLabel(value: string | null | undefined) {
  if (!value) return "Unknown"
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function aggregateBreakdown(
  key: string,
  label: string,
  rows: BookingWithListing[],
  refundsByBooking: Map<string, number>
) {
  const paid = rows.filter((r) => ["confirmed", "completed"].includes(String(r.status)))
  const gmv = paid.reduce((s, r) => s + Number(r.total_charged ?? 0), 0)
  const grossTake = paid.reduce((s, r) => s + dollarsFromCents(grossPlatformTakeCents(r)), 0)
  const cashTake = paid.reduce((s, r) => s + dollarsFromCents(cashPlatformTakeCents(r)), 0)
  const refunds = paid.reduce((s, r) => s + (refundsByBooking.get(String(r.id)) ?? bookingRefundedDollars(r)), 0)
  const guestTotal = paid.reduce((s, r) => s + Math.max(1, Number(r.guest_count ?? 1)), 0)

  return {
    key,
    label,
    bookings: paid.length,
    gmv,
    grossTake,
    netRevenue: cashTake - refunds,
    avgOrderSize: paid.length > 0 ? gmv / paid.length : 0,
    avgGuests: paid.length > 0 ? guestTotal / paid.length : 0,
  }
}

async function loadBookingsInRange(admin: AdminClient, start: string, end: string) {
  const { data, error } = await admin
    .from("bookings")
    .select(`${BOOKING_SELECT}, listings(service_type, city, state, location_city, location_state)`)
    .gte("created_at", `${start}T00:00:00.000Z`)
    .lte("created_at", `${end}T23:59:59.999Z`)

  if (error) {
    const fallback = await admin
      .from("bookings")
      .select(BOOKING_SELECT)
      .gte("created_at", `${start}T00:00:00.000Z`)
      .lte("created_at", `${end}T23:59:59.999Z`)
    return (fallback.data ?? []) as BookingWithListing[]
  }

  return (data ?? []) as BookingWithListing[]
}

async function loadRefundsInRange(admin: AdminClient, start: string, end: string) {
  const { data } = await admin
    .from("financial_events")
    .select("booking_id, amount_cents, event_type")
    .in("event_type", ["refund", "chargeback", "chargeback_fee"])
    .gte("occurred_at", `${start}T00:00:00.000Z`)
    .lte("occurred_at", `${end}T23:59:59.999Z`)

  const byBooking = new Map<string, number>()
  let chargebacks = 0

  for (const row of data ?? []) {
    const amount = Math.abs(Number(row.amount_cents ?? 0)) / 100
    if (row.event_type === "refund" && row.booking_id) {
      byBooking.set(String(row.booking_id), (byBooking.get(String(row.booking_id)) ?? 0) + amount)
    } else if (row.event_type === "chargeback" || row.event_type === "chargeback_fee") {
      chargebacks += amount
    }
  }

  return { byBooking, chargebacks }
}

export async function buildFinanceDashboard(
  admin: AdminClient,
  period: FinancePeriod = "mtd",
  opts?: { includeSheetCosts?: boolean }
): Promise<FinanceDashboardPayload> {
  const asOf = yesterdayIso()
  const range = resolveFinancePeriodRange(period, asOf)
  const includeSheetCosts = opts?.includeSheetCosts !== false

  const [bookings, refundData, snapshots, supplyCounts, costsResult] = await Promise.all([
    loadBookingsInRange(admin, range.start, range.end),
    loadRefundsInRange(admin, range.start, range.end),
    admin
      .from("finance_snapshots")
      .select("*")
      .gte("snapshot_date", range.start)
      .lte("snapshot_date", range.end)
      .order("snapshot_date", { ascending: true }),
    Promise.all([
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .or("ui_intent.in.(host,both),is_host.eq.true")
        .gte("created_at", `${range.start}T00:00:00.000Z`)
        .lte("created_at", `${range.end}T23:59:59.999Z`),
      admin
        .from("listings")
        .select("id", { count: "exact", head: true })
        .gte("created_at", `${range.start}T00:00:00.000Z`)
        .lte("created_at", `${range.end}T23:59:59.999Z`),
      admin
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("is_deleted", false),
      admin.from("listings").select("host_id").eq("is_deleted", false),
    ]),
    (async () => {
      if (!includeSheetCosts || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        return { costs: null as TrackerCostsSummary | null, masterReportId: null as string | null }
      }
      try {
        const { data: settings } = await admin
          .from("platform_settings")
          .select("key, value")
          .eq("key", "gdrive_master_report_id")
          .maybeSingle()
        const costs = await readFinanceTrackerCosts(range.start, range.end)
        const masterReportId = settings?.value
          ? String(settings.value).replace(/^"|"$/g, "")
          : null
        return { costs, masterReportId }
      } catch {
        return { costs: null, masterReportId: null }
      }
    })(),
  ])

  const paidBookings = bookings.filter((b) => ["confirmed", "completed"].includes(String(b.status)))
  const gmv = paidBookings.reduce((s, b) => s + Number(b.total_charged ?? 0), 0)
  const grossTake = paidBookings.reduce((s, b) => s + dollarsFromCents(grossPlatformTakeCents(b)), 0)
  const cashTake = paidBookings.reduce((s, b) => s + dollarsFromCents(cashPlatformTakeCents(b)), 0)
  const promoCredits = paidBookings.reduce(
    (s, b) => s + dollarsFromCents(promoCreditsAppliedCents(b)),
    0
  )
  const hostPayouts = paidBookings.reduce((s, b) => s + Number(b.host_payout ?? 0), 0)
  const refundsFromEvents = Array.from(refundData.byBooking.values()).reduce((s, v) => s + v, 0)
  const refundsFromBookings = paidBookings.reduce(
    (s, b) => s + bookingRefundedDollars(b as Record<string, unknown>),
    0
  )
  const refunds = Math.max(refundsFromEvents, refundsFromBookings)
  const netRevenue = cashTake - refunds - refundData.chargebacks
  const guestTotal = paidBookings.reduce((s, b) => s + Math.max(1, Number(b.guest_count ?? 1)), 0)

  const costs = costsResult.costs
  const fixedOpEx = costs?.fixedOpEx ?? 0
  const adHoc = costs?.adHoc ?? 0
  const adSpend = costs?.adSpend ?? 0
  const totalExpenses = fixedOpEx + adHoc + adSpend
  const netContribution = netRevenue - promoCredits - totalExpenses
  const avgCashTakePerBooking = paidBookings.length > 0 ? netRevenue / paidBookings.length : 0

  const breakevenBookingsNeeded =
    avgCashTakePerBooking > 0 && netContribution < 0
      ? Math.ceil(Math.abs(netContribution) / avgCashTakePerBooking)
      : netContribution < 0
        ? null
        : 0

  const takeRate = gmv > 0 ? grossTake / gmv : 0
  const avgOrderSize = paidBookings.length > 0 ? gmv / paidBookings.length : 0
  const avgGuestsPerOrder = paidBookings.length > 0 ? guestTotal / paidBookings.length : 0

  const byService = new Map<string, BookingWithListing[]>()
  const byGeo = new Map<string, BookingWithListing[]>()
  for (const row of paidBookings) {
    const stKey = String(row.listings?.service_type ?? "unknown")
    const geoKey = marketLabel(row.listings).toLowerCase()
    if (!byService.has(stKey)) byService.set(stKey, [])
    if (!byGeo.has(geoKey)) byGeo.set(geoKey, [])
    byService.get(stKey)!.push(row)
    byGeo.get(geoKey)!.push(row)
  }

  const sheetId = resolveFinanceTrackerSheetId()
  const snapshotRows = snapshots.data ?? []

  const dailySeries: FinanceDailyPoint[] = snapshotRows.map((s) => ({
    date: String(s.snapshot_date),
    bookings: Number(s.booking_count ?? 0),
    gmv: Number(s.gross_booking_value ?? 0),
    netRevenue: Number(s.net_platform_revenue ?? 0),
    adSpend: 0,
  }))

  if (costs && dailySeries.length > 0) {
    const perDayAd = adSpend / dailySeries.length
    for (const point of dailySeries) {
      point.adSpend = perDayAd
    }
  }

  return {
    period,
    range,
    asOf,
    marketplace: {
      bookings: paidBookings.length,
      gmv,
      grossTake,
      cashTake,
      promoCredits,
      refunds,
      chargebacks: refundData.chargebacks,
      netRevenue,
      hostPayouts,
      avgOrderSize,
      avgGuestsPerOrder,
      takeRate,
    },
    supply: {
      newHosts: supplyCounts[0].count ?? 0,
      newListings: supplyCounts[1].count ?? 0,
      totalListings: supplyCounts[2].count ?? 0,
      totalHosts: new Set(
        (supplyCounts[3].data ?? [])
          .map((row) => row.host_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      ).size,
    },
    ads: {
      spend: adSpend,
      hostClicks: costs?.adMetrics.hostClicks ?? 0,
      hostOnboarding: costs?.adMetrics.hostOnboarding ?? 0,
      listingsCreated: costs?.adMetrics.listingsCreated ?? 0,
      purchases: costs?.adMetrics.purchases ?? 0,
      roas: adSpend > 0 ? netRevenue / adSpend : null,
      cpa: paidBookings.length > 0 && adSpend > 0 ? adSpend / paidBookings.length : null,
    },
    expenses: {
      fixedOpEx,
      adHoc,
      adSpend,
      total: totalExpenses,
      lineItems: costs?.lineItems ?? [],
      fixedByCategory: costs?.fixedByCategory ?? {},
    },
    pnl: {
      netContribution,
      profitMargin: netRevenue !== 0 ? netContribution / Math.abs(netRevenue) : null,
      breakevenBookingsNeeded,
      breakevenGmvNeeded:
        takeRate > 0 && netContribution < 0
          ? Math.abs(netContribution) / takeRate
          : null,
      avgCashTakePerBooking,
    },
    breakdown: {
      byServiceType: Array.from(byService.entries())
        .map(([key, rows]) => aggregateBreakdown(key, serviceLabel(key), rows, refundData.byBooking))
        .sort((a, b) => b.gmv - a.gmv),
      byGeo: Array.from(byGeo.entries())
        .map(([key, rows]) =>
          aggregateBreakdown(key, key === "unknown" ? "Unknown" : rows[0]?.listings ? marketLabel(rows[0].listings) : key, rows, refundData.byBooking)
        )
        .sort((a, b) => b.gmv - a.gmv),
    },
    dailySeries,
    sources: {
      financeTrackerSheetId: sheetId,
      financeTrackerUrl: `https://docs.google.com/spreadsheets/d/${sheetId}`,
      masterReportId: costsResult.masterReportId,
      costsSyncedAt: costs?.syncedAt ?? null,
      sheetsAvailable: Boolean(costs),
    },
  }
}
