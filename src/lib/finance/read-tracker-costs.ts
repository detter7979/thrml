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
}

export type TrackerCostsSummary = {
  fixedOpEx: number
  adHoc: number
  adSpend: number
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
      range: "Ad Hoc Costs!A2:F200",
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

  const fixedOpEx = (fixedMonthlyTotal / monthDays) * periodDays

  let adHoc = 0
  for (const row of adHocRows) {
    const date = parseSheetDate(row[0])
    const amount = parseMoney(row[3])
    if (!date || amount <= 0 || !dateInRange(date, start, end)) continue
    adHoc += amount
    lineItems.push({
      label: String(row[1] ?? "Ad hoc").trim() || "Ad hoc",
      category: String(row[2] ?? "Variable").trim() || "Variable",
      amount,
      source: "ad_hoc",
    })
  }

  const headers = platformRows[0] ?? []
  const iDate = colIndex(headers, "Date", 0)
  const iSpend = colIndex(headers, "Spend ($)", 27)
  const iBhc = colIndex(headers, "become_host_click", 31)
  const iHos = colIndex(headers, "host_onboarding_started", 32)
  const iLc = colIndex(headers, "listing_created", 33)
  const iPur = colIndex(headers, "Purchase", 34)

  let adSpend = 0
  let hostClicks = 0
  let hostOnboarding = 0
  let listingsCreated = 0
  let purchases = 0

  for (const row of platformRows.slice(1)) {
    const date = parseSheetDate(row[iDate])
    if (!date || !dateInRange(date, start, end)) continue
    adSpend += parseMoney(row[iSpend])
    hostClicks += parseIntMetric(row[iBhc])
    hostOnboarding += parseIntMetric(row[iHos])
    listingsCreated += parseIntMetric(row[iLc])
    purchases += parseIntMetric(row[iPur])
  }

  if (adSpend > 0) {
    lineItems.push({
      label: "Paid media (Meta + channels)",
      category: "Marketing",
      amount: adSpend,
      source: "ad_spend",
    })
  }

  return {
    fixedOpEx,
    adHoc,
    adSpend,
    total: fixedOpEx + adHoc + adSpend,
    lineItems: lineItems.sort((a, b) => b.amount - a.amount),
    fixedByCategory,
    adMetrics: { hostClicks, hostOnboarding, listingsCreated, purchases },
    syncedAt: new Date().toISOString(),
  }
}
