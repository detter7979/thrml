import { google } from "googleapis"

import { loadGoogleServiceAccountCredentials } from "@/lib/google-service-account"
import { resolveFinanceTrackerSheetId } from "@/lib/finance/sheet-config"
import {
  dateInRange,
  daysInMonth,
  daysInclusive,
  parseSheetDate,
} from "@/lib/finance/period-utils"

export type TrackerCostLine = {
  label: string
  category: string
  amount: number
  source: "fixed" | "ad_hoc" | "ad_spend"
  /** Expense log details (absent for plan estimates and API ad spend). */
  date?: string
  type?: ExpenseType
  entrySource?: string
  receipt?: string
}

export const EXPENSE_TYPES = ["Recurring", "Ad hoc", "Ad platform", "Other"] as const
export type ExpenseType = (typeof EXPENSE_TYPES)[number]

export type TrackerCostsSummary = {
  /** Recurring costs: logged "Recurring" expenses, or the prorated Fixed Costs plan if none logged. */
  fixedOpEx: number
  fixedSource: "logged" | "plan"
  /** The Fixed Costs plan for the period (budget), regardless of what was logged. */
  fixedPlan: number
  /** "Ad hoc" + "Other" expenses. */
  adHoc: number
  other: number
  /** Ad platform invoices if any were logged in the period, otherwise API spend from Platform Data. */
  adSpend: number
  adSpendSource: "invoices" | "platform_api"
  adSpendApi: number
  adSpendInvoiced: number
  adSpendByPlatform: Record<string, number>
  total: number
  lineItems: TrackerCostLine[]
  fixedByCategory: Record<string, number>
  adMetrics: {
    hostClicks: number
    hostOnboarding: number
    listingsCreated: number
    purchases: number
  }
  syncedAt: string
}

function colIndex(headers: string[], name: string, fallback: number) {
  const i = headers.indexOf(name)
  return i >= 0 ? i : fallback
}

function parseMoney(value: unknown) {
  if (value == null || value === "") return 0
  const n = parseFloat(String(value).replace(/[$,]/g, ""))
  return Number.isFinite(n) ? n : 0
}

function parseIntMetric(value: unknown) {
  if (value == null || value === "") return 0
  const n = parseInt(String(value).replace(/,/g, ""), 10)
  return Number.isFinite(n) ? n : 0
}

export async function readFinanceTrackerCosts(
  start: string,
  end: string,
  spreadsheetId?: string
): Promise<TrackerCostsSummary> {
  const sheetId = spreadsheetId ?? resolveFinanceTrackerSheetId()
  const auth = new google.auth.GoogleAuth({
    credentials: loadGoogleServiceAccountCredentials(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  const sheets = google.sheets({ version: "v4", auth })

  const [fixedRes, adHocRes, platformRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Fixed Costs!A2:E50",
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "'Expenses'!A3:H2000",
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Platform Data!A1:AZ50000",
    }),
  ])

  const fixedRows = fixedRes.data.values ?? []
  const adHocRows = adHocRes.data.values ?? []
  const platformRows = platformRes.data.values ?? []

  const periodDays = daysInclusive(start, end)
  const monthDays = daysInMonth(end)

  const lineItems: TrackerCostLine[] = []
  const fixedByCategory: Record<string, number> = {}
  let fixedMonthlyTotal = 0

  for (const row of fixedRows) {
    const label = String(row[0] ?? "").trim()
    const category = String(row[1] ?? "Other").trim() || "Other"
    const monthly = parseMoney(row[2])
    if (!label || label.toUpperCase().includes("TOTAL") || monthly <= 0) continue
    fixedMonthlyTotal += monthly
    fixedByCategory[category] = (fixedByCategory[category] ?? 0) + monthly
    const prorated = (monthly / monthDays) * periodDays
    lineItems.push({
      label,
      category,
      amount: prorated,
      source: "fixed",
    })
  }

  const fixedPlan = (fixedMonthlyTotal / monthDays) * periodDays

  // Expense log: A Date · B Vendor/Item · C Type · D Category · E Amount · F Source · G Receipt · H Notes
  let adHoc = 0
  let other = 0
  let recurringLogged = 0
  let adSpendInvoiced = 0
  const logged: TrackerCostLine[] = []
  for (const row of adHocRows) {
    const date = parseSheetDate(row[0])
    const amount = parseMoney(row[4])
    if (!date || amount === 0 || !dateInRange(date, start, end)) continue
    const rawType = String(row[2] ?? "").trim().toLowerCase()
    const type: ExpenseType =
      rawType === "recurring" ? "Recurring" : rawType === "ad platform" ? "Ad platform" : rawType === "other" ? "Other" : "Ad hoc"
    const line: TrackerCostLine = {
      label: String(row[1] ?? "Expense").trim() || "Expense",
      category: String(row[3] ?? "").trim() || type,
      amount,
      source: type === "Recurring" ? "fixed" : type === "Ad platform" ? "ad_spend" : "ad_hoc",
      date,
      type,
      entrySource: String(row[5] ?? "").trim() || "Manual",
      receipt: String(row[6] ?? "").trim() || undefined,
    }
    logged.push(line)
    if (type === "Recurring") recurringLogged += amount
    else if (type === "Ad platform") adSpendInvoiced += amount
    else if (type === "Other") other += amount
    else adHoc += amount
  }

  const fixedSource: "logged" | "plan" = logged.some((l) => l.type === "Recurring") ? "logged" : "plan"
  const fixedOpEx = fixedSource === "logged" ? recurringLogged : fixedPlan
  // Plan lines are estimates; drop them when real recurring charges were logged.
  const planLines = lineItems.splice(0, lineItems.length)
  if (fixedSource === "plan") lineItems.push(...planLines)
  lineItems.push(...logged)

  const headers = platformRows[0] ?? []
  const iDate = colIndex(headers, "Date", 0)
  const iSpend = colIndex(headers, "Spend ($)", 27)
  const iBhc = colIndex(headers, "become_host_click", 31)
  const iHos = colIndex(headers, "host_onboarding_started", 32)
  const iLc = colIndex(headers, "listing_created", 33)
  const iPur = colIndex(headers, "Purchase", 34)

  let adSpendApi = 0
  const adSpendByPlatform: Record<string, number> = {}
  const iPlatform = colIndex(headers, "Platform", 4)
  let hostClicks = 0
  let hostOnboarding = 0
  let listingsCreated = 0
  let purchases = 0

  for (const row of platformRows.slice(1)) {
    const date = parseSheetDate(row[iDate])
    if (!date || !dateInRange(date, start, end)) continue
    const spend = parseMoney(row[iSpend])
    adSpendApi += spend
    const platform = String(row[iPlatform] ?? "Unknown") || "Unknown"
    adSpendByPlatform[platform] = (adSpendByPlatform[platform] ?? 0) + spend
    hostClicks += parseIntMetric(row[iBhc])
    hostOnboarding += parseIntMetric(row[iHos])
    listingsCreated += parseIntMetric(row[iLc])
    purchases += parseIntMetric(row[iPur])
  }

  const adSpendSource: "invoices" | "platform_api" = adSpendInvoiced > 0 ? "invoices" : "platform_api"
  const adSpend = adSpendSource === "invoices" ? adSpendInvoiced : adSpendApi
  if (adSpendSource === "platform_api" && adSpendApi > 0) {
    lineItems.push({
      label: "Paid media (platform API, until invoices are logged)",
      category: "Marketing",
      amount: adSpendApi,
      source: "ad_spend",
    })
  }

  return {
    fixedOpEx,
    fixedSource,
    fixedPlan,
    adHoc,
    other,
    adSpend,
    adSpendSource,
    adSpendApi,
    adSpendInvoiced,
    adSpendByPlatform,
    total: fixedOpEx + adHoc + other + adSpend,
    lineItems: lineItems.sort((a, b) => b.amount - a.amount),
    fixedByCategory,
    adMetrics: { hostClicks, hostOnboarding, listingsCreated, purchases },
    syncedAt: new Date().toISOString(),
  }
}
