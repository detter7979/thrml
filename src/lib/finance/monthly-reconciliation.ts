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
    fixedSource: "logged" | "plan"
    fixedPlan: number
    adHoc: number
    other: number
    adSpend: number
    adSpendSource: "invoices" | "platform_api"
    adSpendApi: number
    adSpendInvoiced: number
    adSpendByPlatform: Record<string, number>
    total: number
    lineItems: TrackerCostLine[]
  }
  budget: { adSpend: number; recurring: number; total: number }
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
    costs = {
      available: true,
      fixedOpEx: c.fixedOpEx,
      fixedSource: c.fixedSource,
      fixedPlan: c.fixedPlan,
      adHoc: c.adHoc,
      other: c.other,
      adSpend: c.adSpend,
      adSpendSource: c.adSpendSource,
      adSpendApi: c.adSpendApi,
      adSpendInvoiced: c.adSpendInvoiced,
      adSpendByPlatform: c.adSpendByPlatform,
      total: c.total,
      lineItems: c.lineItems,
    }
  } catch (e) {
    costs = {
      available: false,
      error: e instanceof Error ? e.message : String(e),
      fixedOpEx: 0, fixedSource: "plan", fixedPlan: 0, adHoc: 0, other: 0, adSpend: 0,
      adSpendSource: "platform_api", adSpendApi: 0, adSpendInvoiced: 0, adSpendByPlatform: {}, total: 0, lineItems: [],
    }
  }

  const { data: budgetRow } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "finance_ad_budget_monthly_usd")
    .maybeSingle()
  const adBudget = Number(String(budgetRow?.value ?? "3000").replace(/"/g, "")) || 0
  const budget = { adSpend: adBudget, recurring: round2(costs.fixedPlan), total: round2(adBudget + costs.fixedPlan) }

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
  if (costs.available && costs.adSpendInvoiced > 0 && costs.adSpendApi > 0) {
    const d = round2(costs.adSpendInvoiced - costs.adSpendApi)
    checks.push({
      label: "Ad invoices match platform spend",
      ok: Math.abs(d) <= Math.max(1, costs.adSpendApi * 0.02),
      detail: `Invoices $${costs.adSpendInvoiced.toFixed(2)} vs platform API $${costs.adSpendApi.toFixed(2)} (diff $${d.toFixed(2)})`,
    })
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
    budget,
    bottomLine: { revenue, expenses, stripeFees, net },
    checks,
  }
}

// ── Google Sheets output: Close_<Month>_<Year> tab + Close Index row ────────────

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

export function closeTabName(month: string) {
  const [y, m] = month.split("-").map(Number)
  return `Close_${MONTHS[m - 1]}_${y}`
}
function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

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

type Cell = string | number
type RowKind = "title" | "subtitle" | "section" | "total" | "money" | "plain" | "blank"
type CloseRow = { kind: RowKind; cells: Cell[]; pctCol?: boolean }

const pct = (actual: number, plan: number): Cell => (plan > 0 ? round2(((actual - plan) / plan) * 100) / 100 : "—")

export function buildCloseRows(r: ReconciliationResult): CloseRow[] {
  const rows: CloseRow[] = []
  const push = (kind: RowKind, cells: Cell[], pctCol = false) => rows.push({ kind, cells, pctCol })
  const c = r.costs
  const out = round2(c.total + r.stripe.stripeFeesUsd)
  const budgetOut = r.budget.total

  push("title", [`thrml — Monthly Close: ${monthLabel(r.month)}`])
  push("subtitle", [`Period: ${r.start} → ${r.end}   |   Generated: ${r.generatedAt.slice(0, 16).replace("T", " ")} UTC   |   Stripe: ${r.stripe.mode} mode`])
  push("blank", [])

  push("section", ["SPENDING", "BUDGET ($)", "ACTUAL ($)", "VARIANCE ($)", "VAR %", "NOTES"])
  push("money", ["Ad Spend", r.budget.adSpend, c.adSpend, round2(c.adSpend - r.budget.adSpend), pct(c.adSpend, r.budget.adSpend),
    c.adSpendSource === "invoices" ? "From ad platform invoices (Expenses tab)" : "From platform API (no invoices logged yet)"], true)
  push("money", ["Recurring (Fixed)", r.budget.recurring, c.fixedOpEx, round2(c.fixedOpEx - r.budget.recurring), pct(c.fixedOpEx, r.budget.recurring),
    c.fixedSource === "logged" ? "Logged recurring charges (Expenses tab)" : "Estimated from Fixed Costs plan (no charges logged)"], true)
  push("money", ["Ad Hoc", "—", c.adHoc, "—", "—", "One-time / variable (Expenses tab)"])
  push("money", ["Other", "—", c.other, "—", "—", "Expenses tab, type Other"])
  push("money", ["Stripe Fees", "—", r.stripe.stripeFeesUsd, "—", "—", "From Stripe balance transactions"])
  push("total", ["TOTAL OUT", budgetOut, out, round2(out - budgetOut), pct(out, budgetOut), out > budgetOut ? "🔴 OVER BUDGET" : "🟢 UNDER BUDGET"], true)
  push("blank", [])

  push("section", ["MONEY IN", "", "AMOUNT ($)", "", "", "NOTES"])
  const m = r.marketplace
  push("money", ["Booking value (what guests paid)", "", m.grossBookingValue, "", "", `${m.bookings} bookings`])
  push("money", ["Platform take (guest + host fees)", "", m.grossPlatformTake, "", "", ""])
  push("money", ["Host payouts (passed through)", "", m.hostPayouts, "", "", "Not revenue — paid out to hosts"])
  push("money", ["Refunds", "", -m.refunds, "", "", ""])
  push("money", ["Credits applied", "", -m.creditsApplied, "", "", "Promo / referral credits"])
  push("money", ["Chargebacks", "", -m.chargebacks, "", "", ""])
  push("total", ["NET PLATFORM REVENUE", "", m.netPlatformRevenue, "", "", ""])
  push("blank", [])

  push("section", ["BOTTOM LINE", "", "AMOUNT ($)", "", "", ""])
  push("money", ["Money in (net platform revenue)", "", r.bottomLine.revenue, "", "", ""])
  push("money", ["Money out (total out)", "", -out, "", "", ""])
  push("total", ["NET (IN − OUT)", "", round2(r.bottomLine.revenue - out), "", "", r.bottomLine.revenue - out >= 0 ? "🟢 PROFIT" : "🔴 LOSS"])
  push("blank", [])

  push("section", ["AD SPEND BY PLATFORM", "", "API ($)", "", "", ""])
  const plats = Object.entries(c.adSpendByPlatform).filter(([, v]) => v > 0)
  if (plats.length) plats.forEach(([k, v]) => push("money", [k, "", round2(v), "", "", ""]))
  else push("plain", ["(no platform spend this month)"])
  push("money", ["Ad platform invoices logged", "", c.adSpendInvoiced, "", "", c.adSpendInvoiced ? "Used as actual ad spend" : "None yet"])
  push("blank", [])

  push("section", ["RECURRING COSTS", "", "AMOUNT ($)", "CATEGORY", "", "SOURCE"])
  const recurring = c.lineItems.filter((l) => l.source === "fixed")
  if (recurring.length) recurring.forEach((l) => push("money", [l.label, "", round2(l.amount), l.category, "", l.type === "Recurring" ? `${l.entrySource ?? "Manual"}${l.date ? " · " + l.date : ""}` : "Fixed Costs plan"]))
  else push("plain", ["(none)"])
  push("blank", [])

  push("section", ["AD HOC / OTHER / INVOICES", "DATE", "AMOUNT ($)", "CATEGORY", "TYPE", "SOURCE / RECEIPT"])
  const logged = c.lineItems.filter((l) => l.type && l.type !== "Recurring")
  if (logged.length) logged.forEach((l) => push("money", [l.label, l.date ?? "", round2(l.amount), l.category, l.type ?? "", [l.entrySource, l.receipt].filter(Boolean).join(" · ")]))
  else push("plain", ["(none logged)"])
  push("blank", [])

  push("section", ["CHECKS", "STATUS", "", "", "", "DETAIL"])
  r.checks.forEach((ch) => push("plain", [ch.label, ch.ok ? "✅ OK" : "⚠️ CHECK", "", "", "", ch.detail]))
  push("blank", [])

  push("section", ["BOOKINGS BY STATUS", "COUNT", "", "", "", "Session date in month"])
  const st = Object.entries(r.bookingStatuses)
  if (st.length) st.forEach(([k, v]) => push("plain", [k, v]))
  else push("plain", ["(none)", 0])
  return rows
}

const NAVY = { red: 0.078, green: 0.133, blue: 0.216 }
const LIGHT = { red: 0.937, green: 0.945, blue: 0.957 }
const WHITE = { red: 1, green: 1, blue: 1 }

type Sheets = ReturnType<typeof google.sheets>

/** Tab order: summary → closes (newest first) → inputs → data → everything else. */
export async function reorderTrackerTabs(sheets: Sheets, spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" })
  const props = (meta.data.sheets ?? []).map((s) => s.properties!).filter(Boolean)
  const closeKey = (t: string) => {
    const [, name, year] = t.split("_")
    return Number(year) * 100 + (MONTHS.indexOf(name) + 1)
  }
  const fixedOrder = ["Executive Summary", "Close Index"]
  const after = ["Fixed Costs", "Expenses", "Marketplace Data", "Platform Data", "P&L Dashboard", "Targeting Lookup"]
  const titles = props.map((p) => p.title ?? "")
  const closes = titles.filter((t) => /^Close_[A-Za-z]+_\d{4}$/.test(t)).sort((a, b) => closeKey(b) - closeKey(a))
  const ordered = [
    ...fixedOrder.filter((t) => titles.includes(t)),
    ...closes,
    ...after.filter((t) => titles.includes(t)),
    ...titles.filter((t) => !fixedOrder.includes(t) && !after.includes(t) && !closes.includes(t)),
  ]
  const requests = ordered.map((title, index) => ({
    updateSheetProperties: {
      properties: { sheetId: props.find((p) => p.title === title)!.sheetId, index },
      fields: "index",
    },
  }))
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
}

const INDEX_TAB = "Close Index"
const INDEX_HEADERS = ["Month", "Period", "Actual Out ($)", "Budget ($)", "Variance ($)", "Status", "Tab", "Ad Spend ($)", "Net Revenue ($)", "Net In − Out ($)", "Checks"]

export async function writeReconciliationToSheet(
  r: ReconciliationResult,
  spreadsheetId: string
): Promise<{ spreadsheetId: string; tab: string; url: string }> {
  const auth = new google.auth.GoogleAuth({
    credentials: loadGoogleServiceAccountCredentials(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  const sheets = google.sheets({ version: "v4", auth })
  const tab = closeTabName(r.month)

  // Recreate the close tab each run so formatting from a previous layout can't linger.
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" })
  const existing = meta.data.sheets?.find((s) => s.properties?.title === tab)?.properties?.sheetId
  const pre: object[] = []
  if (existing != null) pre.push({ deleteSheet: { sheetId: existing } })
  pre.push({ addSheet: { properties: { title: tab, gridProperties: { rowCount: 200, columnCount: 6 } } } })
  if (!meta.data.sheets?.some((s) => s.properties?.title === INDEX_TAB)) pre.push({ addSheet: { properties: { title: INDEX_TAB } } })
  const created = await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: pre } })
  const sheetId = created.data.replies?.find((x) => x.addSheet?.properties?.title === tab)?.addSheet?.properties?.sheetId ?? 0

  const rows = buildCloseRows(r)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tab}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: rows.map((x) => x.cells) },
  })

  const fmt: object[] = [
    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 300 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 5 }, properties: { pixelSize: 120 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 5, endIndex: 6 }, properties: { pixelSize: 360 }, fields: "pixelSize" } },
    { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true } }, fields: "gridProperties.hideGridlines" } },
  ]
  rows.forEach((row, i) => {
    const range = { sheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 0, endColumnIndex: 6 }
    if (row.kind === "title") fmt.push({ repeatCell: { range, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 15 } } }, fields: "userEnteredFormat.textFormat" } })
    if (row.kind === "subtitle") fmt.push({ repeatCell: { range, cell: { userEnteredFormat: { textFormat: { italic: true, foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 } } } }, fields: "userEnteredFormat.textFormat" } })
    if (row.kind === "section") fmt.push({ repeatCell: { range, cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { bold: true, foregroundColor: WHITE } } }, fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat" } })
    if (row.kind === "total") fmt.push({ repeatCell: { range, cell: { userEnteredFormat: { backgroundColor: LIGHT, textFormat: { bold: true } } }, fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat" } })
    if (row.kind === "money" || row.kind === "total") {
      fmt.push({ repeatCell: { range: { ...range, startColumnIndex: 1, endColumnIndex: 4 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: '"$"#,##0.00;-"$"#,##0.00' } } }, fields: "userEnteredFormat.numberFormat" } })
      if (row.pctCol) fmt.push({ repeatCell: { range: { ...range, startColumnIndex: 4, endColumnIndex: 5 }, cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0.0%" } } }, fields: "userEnteredFormat.numberFormat" } })
    }
  })
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: fmt } })

  // Close Index: one row per month, newest first.
  const idx = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${INDEX_TAB}'!A1:K500` })
  const current = (idx.data.values ?? []).slice(1).filter((row) => row[0] && row[0] !== monthLabel(r.month))
  const out = round2(r.costs.total + r.stripe.stripeFeesUsd)
  const passing = r.checks.filter((ch) => ch.ok).length
  current.push([
    monthLabel(r.month), `${r.start} → ${r.end}`, out, r.budget.total, round2(out - r.budget.total),
    out > r.budget.total ? "🔴 OVER" : "🟢 OK", tab, round2(r.costs.adSpend), round2(r.bottomLine.revenue),
    round2(r.bottomLine.revenue - out), `${passing}/${r.checks.length}`,
  ])
  const toKey = (label: string) => {
    const [name, year] = String(label).split(" ")
    return Number(year) * 100 + (MONTHS.indexOf(name) + 1)
  }
  current.sort((a, b) => toKey(String(b[0])) - toKey(String(a[0])))
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${INDEX_TAB}'!A1:K500` })
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${INDEX_TAB}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [INDEX_HEADERS, ...current] },
  })

  await reorderTrackerTabs(sheets, spreadsheetId)

  return {
    spreadsheetId,
    tab,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`,
  }
}

export async function runMonthlyReconciliation(
  admin: SupabaseClient,
  month: string
): Promise<{
  result: ReconciliationResult
  sheet: { spreadsheetId: string; tab: string; url: string }
  statement: { tab: string; url: string } | null
}> {
  const result = await buildMonthlyReconciliation(admin, month)
  const sheetId = await resolveReconciliationSheetId(admin)
  const sheet = await writeReconciliationToSheet(result, sheetId)

  // Year workbook in Finance › FSS › <year> (one tab per month). Created once per year by hand.
  const { fssStatementsId, loadMonthDetail, writeMonthStatement } = await import("./year-statements")
  const fssId = await fssStatementsId(admin, month.slice(0, 4))
  let statement: { tab: string; url: string } | null = null
  if (fssId) {
    statement = await writeMonthStatement(fssId, result, await loadMonthDetail(admin, month))
  } else {
    result.checks.push({
      label: "FSS year workbook",
      ok: false,
      detail: `No "thrml — ${month.slice(0, 4)} Financial Statements" file set (platform_settings.fss_statements_${month.slice(0, 4)}). Create it in Finance › FSS › ${month.slice(0, 4)} and share it with the thrml-agent service account.`,
    })
  }
  return { result, sheet, statement }
}
