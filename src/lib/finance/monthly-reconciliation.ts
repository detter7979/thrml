import { google } from "googleapis"
import type { SupabaseClient } from "@supabase/supabase-js"

import { readFinanceTrackerCosts, type TrackerCostLine } from "@/lib/finance/read-tracker-costs"
import { resolveFinanceTrackerSheetId } from "@/lib/finance/sheet-config"
import { loadGoogleServiceAccountCredentials } from "@/lib/google-service-account"
import { stripe } from "@/lib/stripe"

/**
 * Monthly reconciliation: money in vs money out for one calendar month (UTC), written to a
 * "Recon YYYY-MM" tab plus one row on a "Monthly Summary" tab in the Finance Tracker sheet
 * (or the sheet in platform_settings.gdrive_reconciliation_sheet_id).
 *
 * Sources:
 *   - finance_snapshots (daily marketplace numbers the finance agent already computes)
 *   - bookings (status counts by session date)
 *   - Finance Tracker tabs (fixed costs, ad hoc costs, ad spend) via readFinanceTrackerCosts
 *   - Stripe balance transactions (what actually moved through Stripe) as a cross-check
 */

export type ReconciliationResult = {
  month: string
  start: string
  end: string
  generatedAt: string
  marketplace: {
    bookings: number
    grossBookingValue: number
    grossPlatformTake: number
    platformRevenue: number
    hostPayouts: number
    refunds: number
    creditsApplied: number
    chargebacks: number
    netPlatformRevenue: number
    newUsers: number
    newListings: number
    daysWithData: number
  }
  bookingStatuses: Record<string, number>
  costs: {
    available: boolean
    error?: string
    fixedOpEx: number
    adHoc: number
    adSpend: number
    total: number
    lineItems: TrackerCostLine[]
  }
  stripe: {
    available: boolean
    error?: string
    mode: "live" | "test" | "unknown"
    byType: Record<string, { count: number; grossUsd: number; feesUsd: number; netUsd: number }>
    chargesGrossUsd: number
    stripeFeesUsd: number
    refundsUsd: number
    transfersToHostsUsd: number
    payoutsToBankUsd: number
  }
  bottomLine: {
    revenue: number
    expenses: number
    stripeFees: number
    net: number
  }
  checks: { label: string; ok: boolean; detail: string }[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function monthRange(month: string): { start: string; end: string; startTs: number; endTsExclusive: number } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("month must be YYYY-MM")
  const [y, m] = month.split("-").map(Number)
  const startDate = new Date(Date.UTC(y, m - 1, 1))
  const nextMonth = new Date(Date.UTC(y, m, 1))
  const endDate = new Date(nextMonth.getTime() - 86_400_000)
  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
    startTs: Math.floor(startDate.getTime() / 1000),
    endTsExclusive: Math.floor(nextMonth.getTime() / 1000),
  }
}

export function previousMonth(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return d.toISOString().slice(0, 7)
}

async function loadMarketplace(admin: SupabaseClient, start: string, end: string) {
  const { data, error } = await admin
    .from("finance_snapshots")
    .select("*")
    .gte("snapshot_date", start)
    .lte("snapshot_date", end)
  if (error) throw new Error(`finance_snapshots: ${error.message}`)
  const sum = (k: string) => (data ?? []).reduce((s, r) => s + (Number((r as Record<string, unknown>)[k]) || 0), 0)
  return {
    bookings: sum("booking_count"),
    grossBookingValue: round2(sum("gross_booking_value")),
    grossPlatformTake: round2(sum("gross_platform_take")),
    platformRevenue: round2(sum("platform_revenue")),
    hostPayouts: round2(sum("host_payouts")),
    refunds: round2(sum("refunds_issued")),
    creditsApplied: round2(sum("credits_applied")),
    chargebacks: round2(sum("chargebacks")),
    netPlatformRevenue: round2(sum("net_platform_revenue")),
    newUsers: sum("new_users"),
    newListings: sum("new_listings"),
    daysWithData: data?.length ?? 0,
  }
}

async function loadBookingStatuses(admin: SupabaseClient, start: string, end: string) {
  const { data, error } = await admin
    .from("bookings")
    .select("status")
    .gte("session_date", start)
    .lte("session_date", end)
  if (error) throw new Error(`bookings: ${error.message}`)
  const counts: Record<string, number> = {}
  for (const b of data ?? []) counts[b.status as string] = (counts[b.status as string] ?? 0) + 1
  return counts
}

async function loadStripe(startTs: number, endTsExclusive: number): Promise<ReconciliationResult["stripe"]> {
  const key = process.env.STRIPE_SECRET_KEY ?? ""
  const mode = key.startsWith("sk_live") || key.startsWith("rk_live") ? "live" : key.startsWith("sk_test") || key.startsWith("rk_test") ? "test" : "unknown"
  const empty = {
    mode,
    byType: {},
    chargesGrossUsd: 0,
    stripeFeesUsd: 0,
    refundsUsd: 0,
    transfersToHostsUsd: 0,
    payoutsToBankUsd: 0,
  } as const
  try {
    const txns = await stripe.balanceTransactions
      .list({ created: { gte: startTs, lt: endTsExclusive }, limit: 100 })
      .autoPagingToArray({ limit: 10_000 })
    const byType: ReconciliationResult["stripe"]["byType"] = {}
    let fees = 0
    for (const t of txns) {
      const row = (byType[t.type] ??= { count: 0, grossUsd: 0, feesUsd: 0, netUsd: 0 })
      row.count++
      row.grossUsd += t.amount / 100
      row.feesUsd += t.fee / 100
      row.netUsd += t.net / 100
      fees += t.fee / 100
    }
    for (const r of Object.values(byType)) {
      r.grossUsd = round2(r.grossUsd)
      r.feesUsd = round2(r.feesUsd)
      r.netUsd = round2(r.netUsd)
    }
    const g = (...types: string[]) => round2(types.reduce((s, t) => s + (byType[t]?.grossUsd ?? 0), 0))
    return {
      available: true,
      mode,
      byType,
      chargesGrossUsd: g("charge", "payment"),
      stripeFeesUsd: round2(fees),
      refundsUsd: Math.abs(g("refund", "payment_refund")),
      transfersToHostsUsd: Math.abs(g("transfer")),
      payoutsToBankUsd: Math.abs(g("payout")),
    }
  } catch (e) {
    return { ...empty, byType: {}, available: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function buildMonthlyReconciliation(admin: SupabaseClient, month: string): Promise<ReconciliationResult> {
  const { start, end, startTs, endTsExclusive } = monthRange(month)

  const [marketplace, bookingStatuses, stripeSummary] = await Promise.all([
    loadMarketplace(admin, start, end),
    loadBookingStatuses(admin, start, end),
    loadStripe(startTs, endTsExclusive),
  ])

  let costs: ReconciliationResult["costs"]
  try {
    const c = await readFinanceTrackerCosts(start, end)
    costs = { available: true, fixedOpEx: c.fixedOpEx, adHoc: c.adHoc, adSpend: c.adSpend, total: c.total, lineItems: c.lineItems }
  } catch (e) {
    costs = { available: false, error: e instanceof Error ? e.message : String(e), fixedOpEx: 0, adHoc: 0, adSpend: 0, total: 0, lineItems: [] }
  }

  const revenue = marketplace.netPlatformRevenue
  const expenses = round2(costs.total)
  const stripeFees = stripeSummary.stripeFeesUsd
  const net = round2(revenue - expenses - stripeFees)

  const checks: ReconciliationResult["checks"] = []
  checks.push({
    label: "Daily finance data complete",
    ok: marketplace.daysWithData >= Number(end.slice(8, 10)),
    detail: `${marketplace.daysWithData} of ${Number(end.slice(8, 10))} days have a finance snapshot`,
  })
  if (stripeSummary.available) {
    const diff = round2(stripeSummary.chargesGrossUsd - marketplace.grossBookingValue)
    checks.push({
      label: "Stripe charges match bookings",
      ok: Math.abs(diff) <= 1,
      detail: `Stripe charges $${stripeSummary.chargesGrossUsd.toFixed(2)} vs booking value $${marketplace.grossBookingValue.toFixed(2)} (diff $${diff.toFixed(2)})`,
    })
    const refundDiff = round2(stripeSummary.refundsUsd - marketplace.refunds)
    checks.push({
      label: "Stripe refunds match records",
      ok: Math.abs(refundDiff) <= 1,
      detail: `Stripe refunds $${stripeSummary.refundsUsd.toFixed(2)} vs recorded $${marketplace.refunds.toFixed(2)} (diff $${refundDiff.toFixed(2)})`,
    })
    checks.push({
      label: "Stripe mode",
      ok: stripeSummary.mode === "live",
      detail: stripeSummary.mode === "live" ? "Live keys" : `Stripe is in ${stripeSummary.mode} mode — these are not real payments`,
    })
  } else {
    checks.push({ label: "Stripe cross-check", ok: false, detail: `Could not read Stripe: ${stripeSummary.error}` })
  }
  checks.push({
    label: "Costs read from Finance Tracker",
    ok: costs.available,
    detail: costs.available ? `${costs.lineItems.length} cost lines` : `Could not read costs: ${costs.error}`,
  })

  return {
    month,
    start,
    end,
    generatedAt: new Date().toISOString(),
    marketplace,
    bookingStatuses,
    costs,
    stripe: stripeSummary,
    bottomLine: { revenue, expenses, stripeFees, net },
    checks,
  }
}

// ── Google Sheets output ─────────────────────────────────────────────────────

const SUMMARY_TAB = "Monthly Summary"
const SUMMARY_HEADERS = [
  "Month", "Bookings", "Booking value", "Platform take", "Host payouts", "Refunds", "Credits",
  "Chargebacks", "Net platform revenue", "Fixed costs", "Ad hoc costs", "Ad spend", "Stripe fees",
  "Net (in − out)", "New users", "New listings", "Checks passing", "Generated",
]

export async function resolveReconciliationSheetId(admin: SupabaseClient): Promise<string> {
  const { data } = await admin
    .from("platform_settings")
    .select("key, value")
    .in("key", ["gdrive_reconciliation_sheet_id", "gdrive_finance_tracker_sheet_id"])
  const get = (k: string) => {
    const v = data?.find((r) => r.key === k)?.value
    return v ? String(v).replace(/^"|"$/g, "") : null
  }
  return get("gdrive_reconciliation_sheet_id") ?? get("gdrive_finance_tracker_sheet_id") ?? resolveFinanceTrackerSheetId()
}

function money(n: number) {
  return round2(n)
}

export function reconciliationRows(r: ReconciliationResult): (string | number)[][] {
  const rows: (string | number)[][] = [
    [`thrml monthly reconciliation — ${r.month}`],
    [`${r.start} to ${r.end} (UTC) · generated ${r.generatedAt.slice(0, 16).replace("T", " ")} UTC`],
    [],
    ["BOTTOM LINE", "USD"],
    ["Net platform revenue (in)", money(r.bottomLine.revenue)],
    ["Expenses: fixed + ad hoc + ad spend (out)", money(r.bottomLine.expenses)],
    ["Stripe fees (out)", money(r.bottomLine.stripeFees)],
    ["Net (in − out)", money(r.bottomLine.net)],
    [],
    ["MARKETPLACE", "USD / count"],
    ["Bookings", r.marketplace.bookings],
    ["Booking value (what guests paid)", money(r.marketplace.grossBookingValue)],
    ["Platform take (guest + host fees)", money(r.marketplace.grossPlatformTake)],
    ["Cash platform revenue", money(r.marketplace.platformRevenue)],
    ["Host payouts", money(r.marketplace.hostPayouts)],
    ["Refunds", money(r.marketplace.refunds)],
    ["Credits applied", money(r.marketplace.creditsApplied)],
    ["Chargebacks", money(r.marketplace.chargebacks)],
    ["Net platform revenue", money(r.marketplace.netPlatformRevenue)],
    ["New users", r.marketplace.newUsers],
    ["New listings", r.marketplace.newListings],
    [],
    ["BOOKINGS BY STATUS (session date in month)", "count"],
    ...Object.entries(r.bookingStatuses).map(([k, v]) => [k, v]),
    ...(Object.keys(r.bookingStatuses).length ? [] : [["(none)", 0]]),
    [],
    ["COSTS (from Finance Tracker)", "USD"],
    ["Fixed costs", money(r.costs.fixedOpEx)],
    ["Ad hoc costs", money(r.costs.adHoc)],
    ["Ad spend", money(r.costs.adSpend)],
    ["Total", money(r.costs.total)],
    ...r.costs.lineItems.map((l) => [`  ${l.label} (${l.source})`, money(l.amount)]),
    [],
    [`STRIPE (${r.stripe.mode} mode)`, "gross", "fees", "net", "count"],
    ...Object.entries(r.stripe.byType).map(([type, v]) => [type, v.grossUsd, v.feesUsd, v.netUsd, v.count]),
    ...(r.stripe.available ? [] : [["unavailable", r.stripe.error ?? ""]]),
    [],
    ["CHECKS", "status", "detail"],
    ...r.checks.map((c) => [c.label, c.ok ? "OK" : "CHECK", c.detail]),
  ]
  return rows
}

export async function writeReconciliationToSheet(
  r: ReconciliationResult,
  spreadsheetId: string
): Promise<{ spreadsheetId: string; tab: string; url: string }> {
  const auth = new google.auth.GoogleAuth({
    credentials: loadGoogleServiceAccountCredentials(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  const sheets = google.sheets({ version: "v4", auth })
  const tab = `Recon ${r.month}`

  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const titles = new Set(meta.data.sheets?.map((s) => s.properties?.title ?? "") ?? [])
  const add = [tab, SUMMARY_TAB].filter((t) => !titles.has(t)).map((title) => ({ addSheet: { properties: { title } } }))
  if (add.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: add } })

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${tab}'!A1:F500` })
  const rows = reconciliationRows(r)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tab}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  })

  // One row per month on the summary tab, replaced in place if the month is re-run.
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${SUMMARY_TAB}'!A1:A500` })
  const col = (existing.data.values ?? []).map((v) => String(v[0] ?? ""))
  if (col[0] !== "Month") {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${SUMMARY_TAB}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [SUMMARY_HEADERS] },
    })
  }
  const passing = r.checks.filter((c) => c.ok).length
  const summaryRow = [
    r.month, r.marketplace.bookings, money(r.marketplace.grossBookingValue), money(r.marketplace.grossPlatformTake),
    money(r.marketplace.hostPayouts), money(r.marketplace.refunds), money(r.marketplace.creditsApplied),
    money(r.marketplace.chargebacks), money(r.marketplace.netPlatformRevenue), money(r.costs.fixedOpEx),
    money(r.costs.adHoc), money(r.costs.adSpend), money(r.bottomLine.stripeFees), money(r.bottomLine.net),
    r.marketplace.newUsers, r.marketplace.newListings, `${passing}/${r.checks.length}`, r.generatedAt.slice(0, 10),
  ]
  const idx = col.indexOf(r.month)
  const rowNumber = idx >= 1 ? idx + 1 : Math.max(col.length, 1) + 1
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SUMMARY_TAB}'!A${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [summaryRow] },
  })

  const sheetGid = (await sheets.spreadsheets.get({ spreadsheetId })).data.sheets?.find((s) => s.properties?.title === tab)?.properties?.sheetId
  return {
    spreadsheetId,
    tab,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit${sheetGid != null ? `#gid=${sheetGid}` : ""}`,
  }
}

export async function runMonthlyReconciliation(
  admin: SupabaseClient,
  month: string
): Promise<{ result: ReconciliationResult; sheet: { spreadsheetId: string; tab: string; url: string } }> {
  const result = await buildMonthlyReconciliation(admin, month)
  const sheetId = await resolveReconciliationSheetId(admin)
  const sheet = await writeReconciliationToSheet(result, sheetId)
  return { result, sheet }
}
