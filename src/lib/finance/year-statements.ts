/**
 * Finance › FSS › <year> › "thrml — <year> Financial Statements": one workbook per year.
 *
 *   Year Summary   one row per month (revenue, refunds, expenses, net) + year-to-date totals
 *   2026-10 Oct    one tab per month: summary P&L, reconciliation checks, every booking,
 *                  refunds, every expense line, ad spend by platform, Stripe activity
 *
 * Written by the monthly close (1st of each month, for the previous month) and on demand from
 * admin. The service account can't create Drive files, so each year's workbook is created once
 * (by hand / by Claude) and its ID stored in platform_settings as fss_statements_<year>.
 *
 * No guest names or contact details are written here — bookings are identified by a short ID.
 */
import { google } from "googleapis"
import type { SupabaseClient } from "@supabase/supabase-js"

import { loadGoogleServiceAccountCredentials } from "@/lib/google-service-account"

import type { ReconciliationResult } from "./monthly-reconciliation"

/** Calendar month bounds (UTC). Kept local so this module doesn't load the Stripe client. */
function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  return { start, end }
}

type Sheets = ReturnType<typeof google.sheets>
type Cell = string | number

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const round2 = (n: number) => Math.round(n * 100) / 100

export function monthTabName(month: string) {
  const [, m] = month.split("-").map(Number)
  return `${month} ${MONTHS[m - 1]}`
}

export type BookingLine = {
  created: string
  sessionDate: string
  id: string
  listing: string
  service: string
  city: string
  guests: number
  status: string
  charged: number
  guestFee: number
  hostFee: number
  platformTake: number
  hostPayout: number
  credits: number
  refunded: number
  adSource: string
}

export type RefundLine = { date: string; id: string; listing: string; amount: number; reason: string }

export type MonthDetail = { bookings: BookingLine[]; refunds: RefundLine[] }

// ── Live data ──────────────────────────────────────────────────────────────

export async function loadMonthDetail(admin: SupabaseClient, month: string): Promise<MonthDetail> {
  const { start, end } = monthRange(month)
  const cols =
    "id, created_at, session_date, status, guest_count, total_charged, guest_fee, service_fee, host_fee, host_payout, referral_credit_applied_cents, user_credit_applied_cents, refunded_amount, refund_amount, refunded_at, cancellation_reason, utm_source, utm_campaign, listings(title, service_type, city, location_city)"
  const [created, refunded] = await Promise.all([
    admin.from("bookings").select(cols).gte("created_at", `${start}T00:00:00Z`).lte("created_at", `${end}T23:59:59Z`).order("created_at"),
    admin.from("bookings").select(cols).gte("refunded_at", `${start}T00:00:00Z`).lte("refunded_at", `${end}T23:59:59Z`).order("refunded_at"),
  ])
  if (created.error) throw new Error(`bookings: ${created.error.message}`)
  type Row = Record<string, unknown> & { listings?: Record<string, unknown> | Record<string, unknown>[] | null }
  const listingOf = (r: Row) => (Array.isArray(r.listings) ? r.listings[0] : r.listings) ?? {}
  const n = (v: unknown) => Number(v) || 0

  const bookings: BookingLine[] = ((created.data ?? []) as Row[]).map((r) => {
    const l = listingOf(r)
    const guestFee = n(r.guest_fee ?? r.service_fee)
    const hostFee = n(r.host_fee)
    return {
      created: String(r.created_at).slice(0, 10),
      sessionDate: String(r.session_date ?? ""),
      id: String(r.id).slice(0, 8),
      listing: String(l.title ?? ""),
      service: String(l.service_type ?? ""),
      city: String(l.city ?? l.location_city ?? ""),
      guests: n(r.guest_count),
      status: String(r.status ?? ""),
      charged: round2(n(r.total_charged)),
      guestFee: round2(guestFee),
      hostFee: round2(hostFee),
      platformTake: round2(guestFee + hostFee),
      hostPayout: round2(n(r.host_payout)),
      credits: round2((n(r.referral_credit_applied_cents) + n(r.user_credit_applied_cents)) / 100),
      refunded: round2(n(r.refunded_amount ?? r.refund_amount)),
      adSource: [r.utm_source, r.utm_campaign].filter(Boolean).join(" / "),
    }
  })
  const refunds: RefundLine[] = ((refunded.data ?? []) as Row[])
    .filter((r) => n(r.refunded_amount ?? r.refund_amount) > 0)
    .map((r) => ({
      date: String(r.refunded_at).slice(0, 10),
      id: String(r.id).slice(0, 8),
      listing: String(listingOf(r).title ?? ""),
      amount: round2(n(r.refunded_amount ?? r.refund_amount)),
      reason: String(r.cancellation_reason ?? ""),
    }))
  return { bookings, refunds }
}

// ── Sheet writing ──────────────────────────────────────────────────────────

type Kind = "title" | "sub" | "section" | "head" | "row" | "total" | "blank"
type Line = { kind: Kind; cells: Cell[]; money?: number[]; pct?: number[] }

function monthLines(r: ReconciliationResult, d: MonthDetail): Line[] {
  const L: Line[] = []
  const add = (kind: Kind, cells: Cell[], money?: number[]) => L.push({ kind, cells, money })
  const m = r.marketplace
  const c = r.costs
  const [y, mo] = r.month.split("-").map(Number)
  const monthName = new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" })

  add("title", [`thrml — ${monthName} ${y} Financial Statement`])
  add("sub", [`${r.start} → ${r.end} · generated ${r.generatedAt.slice(0, 16).replace("T", " ")} UTC · Stripe ${r.stripe.mode} mode`])
  add("blank", [])

  add("section", ["SUMMARY", "Amount ($)", "Notes"])
  add("row", ["Bookings", m.bookings, `${d.bookings.length} booking records created this month`])
  add("row", ["Gross booking value (guests paid)", m.grossBookingValue, "Total charged to guests"], [1])
  add("row", ["Host payouts (pass-through)", -m.hostPayouts, "Owed to hosts — not thrml revenue"], [1])
  add("row", ["Platform take (guest + host fees)", m.grossPlatformTake, ""], [1])
  add("row", ["Credits applied", -m.creditsApplied, "Referral / user credits thrml funded"], [1])
  add("row", ["Refunds", -m.refunds, `${d.refunds.length} refund(s)`], [1])
  add("row", ["Chargebacks", -m.chargebacks, ""], [1])
  add("total", ["Net platform revenue", m.netPlatformRevenue, "Money in"], [1])
  add("blank", [])
  add("row", [`Fixed costs (${c.fixedSource === "logged" ? "logged charges" : "plan estimate"})`, -c.fixedOpEx, c.fixedSource === "plan" ? "From Fixed Costs plan — log real charges in the Expenses tab" : ""], [1])
  add("row", ["Ad hoc / one-off costs", -c.adHoc, ""], [1])
  add("row", ["Other costs", -c.other, ""], [1])
  add("row", [`Ad spend (${c.adSpendSource === "invoices" ? "invoices" : "platform API"})`, -c.adSpend, Object.entries(c.adSpendByPlatform).map(([p, v]) => `${p} $${round2(v)}`).join(" · ")], [1])
  add("row", ["Stripe fees", -r.stripe.stripeFeesUsd, ""], [1])
  add("total", ["Total expenses", -round2(c.total + r.stripe.stripeFeesUsd), "Money out"], [1])
  add("blank", [])
  add("total", ["NET (in − out)", r.bottomLine.net, r.bottomLine.net >= 0 ? "Profit" : "Loss"], [1])
  add("row", ["Budget (ads + recurring)", r.budget.total, `Ads $${r.budget.adSpend} + recurring $${r.budget.recurring}`], [1])
  add("blank", [])

  add("section", ["CHECKS", "Status", "Detail"])
  for (const ch of r.checks) add("row", [ch.label, ch.ok ? "✅ OK" : "⚠️ Check", ch.detail])
  add("blank", [])

  add("section", [`BOOKINGS (${d.bookings.length})`])
  add("head", ["Created", "Session", "Booking", "Listing", "Service", "City", "Guests", "Status", "Charged", "Guest fee", "Host fee", "Platform take", "Host payout", "Credits", "Refunded", "Ad source"])
  for (const b of d.bookings) {
    add("row", [b.created, b.sessionDate, b.id, b.listing, b.service, b.city, b.guests, b.status, b.charged, b.guestFee, b.hostFee, b.platformTake, b.hostPayout, b.credits, b.refunded, b.adSource], [8, 9, 10, 11, 12, 13, 14])
  }
  if (!d.bookings.length) add("row", ["No bookings this month"])
  add("blank", [])

  add("section", [`REFUNDS (${d.refunds.length})`])
  add("head", ["Date", "Booking", "Listing", "Amount", "Reason"])
  for (const f of d.refunds) add("row", [f.date, f.id, f.listing, f.amount, f.reason], [3])
  if (!d.refunds.length) add("row", ["No refunds this month"])
  add("blank", [])

  const lines = c.lineItems
  add("section", [`EXPENSES (${lines.length})`])
  add("head", ["Date", "Item", "Type", "Category", "Amount", "Source", "Receipt / invoice"])
  for (const e of lines) add("row", [e.date ?? "", e.label, e.type ?? e.source, e.category, e.amount, e.entrySource ?? e.source, e.receipt ?? ""], [4])
  if (!lines.length) add("row", ["No expense lines"])
  add("blank", [])

  add("section", ["AD SPEND BY PLATFORM", "Amount ($)"])
  const plats = Object.entries(c.adSpendByPlatform)
  for (const [p, v] of plats) add("row", [p, round2(v)], [1])
  if (!plats.length) add("row", ["No ad spend"])
  add("blank", [])

  add("section", ["STRIPE ACTIVITY", "Count", "Gross ($)", "Fees ($)", "Net ($)"])
  const types = Object.entries(r.stripe.byType)
  for (const [t, v] of types) add("row", [t, v.count, v.grossUsd, v.feesUsd, v.netUsd], [2, 3, 4])
  if (!types.length) add("row", [r.stripe.available ? "No Stripe activity" : `Stripe unavailable: ${r.stripe.error ?? ""}`])
  return L
}

const YEAR_HEADERS = [
  "Month", "Bookings", "Gross booking value", "Platform take", "Refunds", "Credits", "Net platform revenue",
  "Fixed costs", "Ad hoc + other", "Ad spend", "Stripe fees", "Total expenses", "NET", "Checks needing a look",
]

function yearRow(r: ReconciliationResult): Cell[] {
  const m = r.marketplace
  const c = r.costs
  return [
    r.month, m.bookings, m.grossBookingValue, m.grossPlatformTake, m.refunds, m.creditsApplied, m.netPlatformRevenue,
    c.fixedOpEx, round2(c.adHoc + c.other), c.adSpend, r.stripe.stripeFeesUsd, round2(c.total + r.stripe.stripeFeesUsd),
    r.bottomLine.net, r.checks.filter((x) => !x.ok).map((x) => x.label).join("; ") || "—",
  ]
}

function sheetsClient(): Sheets {
  const auth = new google.auth.GoogleAuth({
    credentials: loadGoogleServiceAccountCredentials(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  return google.sheets({ version: "v4", auth })
}

const fmt = {
  money: { numberFormat: { type: "CURRENCY", pattern: '"$"#,##0.00;[Red]-"$"#,##0.00' } },
}

export async function writeMonthStatement(
  spreadsheetId: string,
  r: ReconciliationResult,
  detail: MonthDetail,
  opts: { test?: boolean } = {}
): Promise<{ tab: string; url: string }> {
  const sheets = sheetsClient()
  const tab = monthTabName(r.month)
  const lines = monthLines(r, detail)
  if (opts.test) lines.splice(1, 0, { kind: "sub", cells: ["TEST DATA — synthetic bookings and expenses, not real money"] })

  let meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title,index)" })
  const has = (t: string) => meta.data.sheets?.find((s) => s.properties?.title === t)?.properties?.sheetId
  const pre: object[] = []
  const existing = has(tab)
  if (existing !== undefined && existing !== null) pre.push({ deleteSheet: { sheetId: existing } })
  pre.push({ addSheet: { properties: { title: tab, gridProperties: { rowCount: Math.max(200, lines.length + 20), columnCount: 16 } } } })
  if (has("Year Summary") === undefined) pre.push({ addSheet: { properties: { title: "Year Summary", index: 0 } } })
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: pre } })
  meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title,index)" })
  const sid = has(tab)!
  const ysid = has("Year Summary")!

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tab}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: lines.map((l) => l.cells) },
  })

  // Formatting.
  const reqs: object[] = [
    { updateSheetProperties: { properties: { sheetId: sid, gridProperties: { frozenRowCount: 2 } }, fields: "gridProperties.frozenRowCount" } },
    { updateDimensionProperties: { range: { sheetId: sid, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 300 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: sid, dimension: "COLUMNS", startIndex: 1, endIndex: 16 }, properties: { pixelSize: 120 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: sid, dimension: "COLUMNS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 320 }, fields: "pixelSize" } },
  ]
  lines.forEach((l, i) => {
    const row = { sheetId: sid, startRowIndex: i, endRowIndex: i + 1 }
    if (l.kind === "title") reqs.push({ repeatCell: { range: row, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16 } } }, fields: "userEnteredFormat.textFormat" } })
    if (l.kind === "sub") reqs.push({ repeatCell: { range: row, cell: { userEnteredFormat: { textFormat: { italic: true, foregroundColor: { red: 0.45, green: 0.38, blue: 0.31 } } } }, fields: "userEnteredFormat.textFormat" } })
    if (l.kind === "section") reqs.push({ repeatCell: { range: { ...row, endColumnIndex: 16 }, cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.36, green: 0.29, blue: 0.23 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } })
    if (l.kind === "head") reqs.push({ repeatCell: { range: { ...row, endColumnIndex: 16 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.96, green: 0.94, blue: 0.92 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } })
    if (l.kind === "total") reqs.push({ repeatCell: { range: { ...row, endColumnIndex: 3 }, cell: { userEnteredFormat: { textFormat: { bold: true }, borders: { top: { style: "SOLID" } } } }, fields: "userEnteredFormat(textFormat,borders)" } })
    for (const c of l.money ?? []) {
      reqs.push({ repeatCell: { range: { ...row, startColumnIndex: c, endColumnIndex: c + 1 }, cell: { userEnteredFormat: fmt.money }, fields: "userEnteredFormat.numberFormat" } })
    }
  })
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: reqs } })

  // Year Summary: replace this month's row, keep the rest, add YTD totals.
  const ys = await sheets.spreadsheets.values.get({ spreadsheetId, range: "'Year Summary'!A4:N40", valueRenderOption: "UNFORMATTED_VALUE" })
  const rows = (ys.data.values ?? []).filter((v) => /^\d{4}-\d{2}$/.test(String(v[0] ?? ""))) as Cell[][]
  const byMonth = new Map(rows.map((v) => [String(v[0]), v]))
  byMonth.set(r.month, yearRow(r))
  const sorted = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)
  const year = r.month.slice(0, 4)
  const totals: Cell[] = ["YTD total"]
  for (let c = 1; c < YEAR_HEADERS.length - 1; c++) totals.push(round2(sorted.reduce((s, v) => s + (Number(v[c]) || 0), 0)))
  totals.push("")
  const yValues: Cell[][] = [
    [`thrml — ${year} Financial Statements${opts.test ? " (TEST DATA)" : ""}`],
    ["One tab per month. Months are added on the 1st of the following month by the monthly close."],
    YEAR_HEADERS,
    ...sorted,
    totals,
  ]
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: "'Year Summary'!A1:N60" })
  await sheets.spreadsheets.values.update({ spreadsheetId, range: "'Year Summary'!A1", valueInputOption: "RAW", requestBody: { values: yValues } })
  const totalRow = 3 + sorted.length
  const yReqs: object[] = [
    { repeatCell: { range: { sheetId: ysid, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16 } } }, fields: "userEnteredFormat.textFormat" } },
    { repeatCell: { range: { sheetId: ysid, startRowIndex: 2, endRowIndex: 3, endColumnIndex: 14 }, cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.36, green: 0.29, blue: 0.23 }, wrapStrategy: "WRAP" } }, fields: "userEnteredFormat(textFormat,backgroundColor,wrapStrategy)" } },
    { repeatCell: { range: { sheetId: ysid, startRowIndex: 3, endRowIndex: totalRow + 1, startColumnIndex: 2, endColumnIndex: 13 }, cell: { userEnteredFormat: fmt.money }, fields: "userEnteredFormat.numberFormat" } },
    { repeatCell: { range: { sheetId: ysid, startRowIndex: totalRow, endRowIndex: totalRow + 1, endColumnIndex: 14 }, cell: { userEnteredFormat: { textFormat: { bold: true }, borders: { top: { style: "SOLID" } } } }, fields: "userEnteredFormat(textFormat,borders)" } },
    { updateSheetProperties: { properties: { sheetId: ysid, index: 0, gridProperties: { frozenRowCount: 3 } }, fields: "index,gridProperties.frozenRowCount" } },
  ]
  // Month tabs newest first after Year Summary; drop the empty default Sheet1.
  const months = (meta.data.sheets ?? []).map((s) => s.properties!).filter((p) => /^\d{4}-\d{2} /.test(p.title ?? "")).sort((a, b) => b.title!.localeCompare(a.title!))
  months.forEach((p, i) => yReqs.push({ updateSheetProperties: { properties: { sheetId: p.sheetId, index: i + 1 }, fields: "index" } }))
  const sheet1 = meta.data.sheets?.find((s) => s.properties?.title === "Sheet1")?.properties?.sheetId
  if (sheet1 !== undefined && sheet1 !== null) yReqs.push({ deleteSheet: { sheetId: sheet1 } })
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: yReqs } })

  return { tab, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sid}` }
}

export async function fssStatementsId(admin: SupabaseClient, year: string, test = false): Promise<string | null> {
  const key = test ? `fss_statements_test_${year}` : `fss_statements_${year}`
  const { data } = await admin.from("platform_settings").select("value").eq("key", key).maybeSingle()
  return data?.value ? String(data.value).replace(/^"|"$/g, "") : null
}

// ── Test data ──────────────────────────────────────────────────────────────

function rng(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/** A plausible month of fake bookings, refunds and expenses, shaped exactly like the live data. */
export function fakeMonth(month: string): { result: ReconciliationResult; detail: MonthDetail } {
  const { start, end } = monthRange(month)
  const rand = rng(Number(month.replace("-", "")))
  const days = Number(end.slice(8, 10))
  const listings = [
    { listing: "Cedar barrel sauna · Ballard", service: "sauna", city: "Seattle", price: 45 },
    { listing: "Garden cold plunge · Fremont", service: "cold_plunge", city: "Seattle", price: 30 },
    { listing: "Hot tub under the stars · Shoreline", service: "hot_tub", city: "Shoreline", price: 40 },
    { listing: "Sauna + plunge circuit · Capitol Hill", service: "sauna", city: "Seattle", price: 60 },
  ]
  const nBookings = 10 + Math.floor(rand() * 14)
  const bookings: BookingLine[] = []
  for (let i = 0; i < nBookings; i++) {
    const l = listings[Math.floor(rand() * listings.length)]!
    const guests = 1 + Math.floor(rand() * 3)
    const subtotal = round2(l.price * guests * (rand() < 0.3 ? 2 : 1))
    const guestFee = round2(subtotal * 0.1)
    const hostFee = round2(subtotal * 0.1)
    const day = 1 + Math.floor(rand() * days)
    const created = `${month}-${String(day).padStart(2, "0")}`
    const credits = rand() < 0.15 ? 10 : 0
    const cancelled = rand() < 0.1
    bookings.push({
      created,
      sessionDate: `${month}-${String(Math.min(days, day + Math.floor(rand() * 6))).padStart(2, "0")}`,
      id: Math.floor(rand() * 0xffffffff).toString(16).padStart(8, "0"),
      listing: l.listing,
      service: l.service,
      city: l.city,
      guests,
      status: cancelled ? "cancelled" : "completed",
      charged: round2(subtotal + guestFee - credits),
      guestFee,
      hostFee,
      platformTake: round2(guestFee + hostFee),
      hostPayout: cancelled ? 0 : round2(subtotal - hostFee),
      credits,
      refunded: cancelled ? round2(subtotal + guestFee - credits) : 0,
      adSource: rand() < 0.5 ? "meta / C011_META_guest_all_SEA_P3_RT_PUR" : rand() < 0.5 ? "google / C014" : "",
    })
  }
  bookings.sort((a, b) => a.created.localeCompare(b.created))
  const refunds: RefundLine[] = bookings
    .filter((b) => b.refunded > 0)
    .map((b) => ({ date: b.sessionDate, id: b.id, listing: b.listing, amount: b.refunded, reason: rand() < 0.5 ? "Guest cancelled within policy" : "Host cancelled" }))

  const gbv = round2(bookings.reduce((s, b) => s + b.charged + b.credits, 0))
  const take = round2(bookings.reduce((s, b) => s + b.platformTake, 0))
  const payouts = round2(bookings.reduce((s, b) => s + b.hostPayout, 0))
  const refundTotal = round2(refunds.reduce((s, f) => s + f.amount, 0))
  const credits = round2(bookings.reduce((s, b) => s + b.credits, 0))
  // A refunded booking returns its fees too.
  const refundedFees = round2(bookings.filter((b) => b.refunded > 0).reduce((s, b) => s + b.platformTake, 0))
  const net = round2(take - credits - refundedFees)

  const fixed = [
    ["Supabase", "Infrastructure", 25],
    ["Resend Starter", "Infrastructure", 20],
    ["Redis (Upstash)", "Infrastructure", 7],
    ["Zoho Mail", "Infrastructure", 1],
    ["Domain / DNS", "Infrastructure", 1.67],
  ] as const
  const adhoc = [
    ["Anthropic API", "AI", round2(8 + rand() * 20)],
    ["Vertex AI image generation", "AI", round2(2 + rand() * 6)],
    ["Stock photo license", "Creative", rand() < 0.5 ? 15 : 0],
  ] as const
  const meta = round2(250 + rand() * 300)
  const googleAds = round2(80 + rand() * 120)
  const lineItems = [
    ...fixed.map(([label, category, amount]) => ({ label, category, amount, source: "fixed" as const, date: `${month}-01`, type: "Recurring" as const, entrySource: "Manual" })),
    ...adhoc.filter(([, , a]) => a > 0).map(([label, category, amount]) => ({ label, category, amount, source: "ad_hoc" as const, date: `${month}-${String(5 + Math.floor(rand() * 20)).padStart(2, "0")}`, type: "Ad hoc" as const, entrySource: "Manual" })),
    { label: "Meta Ads", category: "Advertising", amount: meta, source: "ad_spend" as const, date: end, type: "Ad platform" as const, entrySource: "Platform API" },
    { label: "Google Ads", category: "Advertising", amount: googleAds, source: "ad_spend" as const, date: end, type: "Ad platform" as const, entrySource: "Platform API" },
  ]
  const fixedTotal = round2(fixed.reduce((s, [, , a]) => s + a, 0))
  const adHocTotal = round2(adhoc.reduce((s, [, , a]) => s + a, 0))
  const adSpend = round2(meta + googleAds)
  const costsTotal = round2(fixedTotal + adHocTotal + adSpend)
  const stripeFees = round2(bookings.reduce((s, b) => s + b.charged * 0.029 + 0.3, 0))
  const charged = round2(bookings.reduce((s, b) => s + b.charged, 0))

  const result: ReconciliationResult = {
    month,
    start,
    end,
    generatedAt: new Date().toISOString(),
    marketplace: {
      bookings: bookings.length,
      grossBookingValue: gbv,
      grossPlatformTake: take,
      platformRevenue: take,
      hostPayouts: payouts,
      refunds: refundTotal,
      creditsApplied: credits,
      chargebacks: 0,
      netPlatformRevenue: net,
      newUsers: 20 + Math.floor(rand() * 40),
      newListings: Math.floor(rand() * 4),
      daysWithData: days,
    },
    bookingStatuses: bookings.reduce<Record<string, number>>((m, b) => ((m[b.status] = (m[b.status] ?? 0) + 1), m), {}),
    costs: {
      available: true,
      fixedOpEx: fixedTotal,
      fixedSource: "logged",
      fixedPlan: fixedTotal,
      adHoc: adHocTotal,
      other: 0,
      adSpend,
      adSpendSource: "platform_api",
      adSpendApi: adSpend,
      adSpendInvoiced: 0,
      adSpendByPlatform: { Meta: meta, Google: googleAds },
      total: costsTotal,
      lineItems,
    },
    budget: { adSpend: 600, recurring: fixedTotal, total: round2(600 + fixedTotal) },
    stripe: {
      available: true,
      mode: "test",
      byType: {
        charge: { count: bookings.length, grossUsd: charged, feesUsd: stripeFees, netUsd: round2(charged - stripeFees) },
        refund: { count: refunds.length, grossUsd: -refundTotal, feesUsd: 0, netUsd: -refundTotal },
        transfer: { count: bookings.filter((b) => b.hostPayout > 0).length, grossUsd: -payouts, feesUsd: 0, netUsd: -payouts },
      },
      chargesGrossUsd: charged,
      stripeFeesUsd: stripeFees,
      refundsUsd: refundTotal,
      transfersToHostsUsd: payouts,
      payoutsToBankUsd: 0,
    },
    bottomLine: { revenue: net, expenses: costsTotal, stripeFees, net: round2(net - costsTotal - stripeFees) },
    checks: [
      { label: "Daily finance data complete", ok: true, detail: `${days} of ${days} days have a finance snapshot` },
      { label: "Stripe charges match bookings", ok: true, detail: `Stripe charges $${charged.toFixed(2)} vs booking value $${charged.toFixed(2)} (diff $0.00)` },
      { label: "Stripe refunds match records", ok: true, detail: `Stripe refunds $${refundTotal.toFixed(2)} vs recorded $${refundTotal.toFixed(2)} (diff $0.00)` },
      { label: "Stripe mode", ok: false, detail: "TEST DATA — Stripe test mode" },
      { label: "Costs read from Finance Tracker", ok: true, detail: `${lineItems.length} cost lines` },
    ],
  }
  return { result, detail: { bookings, refunds } }
}
