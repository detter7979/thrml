import { google } from "googleapis"
import type { SupabaseClient } from "@supabase/supabase-js"

import { fetchAccountDailySpend, fetchMetaInsights } from "@/lib/agent/meta-api"
import { loadGoogleServiceAccountCredentials } from "@/lib/google-service-account"
import { reorderTrackerTabs, resolveReconciliationSheetId } from "@/lib/finance/monthly-reconciliation"
import { CLEANED_HEADERS, cleanRow, upsertPlatformData, type RawRow } from "@/lib/finance/platform-data-sheet"
import { EXPENSE_TYPES } from "@/lib/finance/read-tracker-costs"

/**
 * One-time / occasional maintenance for the Finance Tracker sheet. Runs with the app's
 * service account (which has edit access), so changes land in the same file and link.
 */

type Sheets = ReturnType<typeof google.sheets>

function sheetsClient(): Sheets {
  const auth = new google.auth.GoogleAuth({
    credentials: loadGoogleServiceAccountCredentials(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  return google.sheets({ version: "v4", auth })
}

const EXPENSES_HEADERS = ["Date", "Vendor / Item", "Type", "Category", "Amount ($)", "Source", "Receipt / Invoice", "Notes", "Month"]
const EXPENSE_SOURCES = ["Manual", "Bank", "Card", "Invoice", "Stripe"]
const NAVY = { red: 0.078, green: 0.133, blue: 0.216 }
const WHITE = { red: 1, green: 1, blue: 1 }

async function tabs(sheets: Sheets, spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" })
  return (meta.data.sheets ?? []).map((s) => ({ title: s.properties?.title ?? "", sheetId: s.properties?.sheetId ?? 0 }))
}

function headerStyle(sheetId: number, row: number, cols: number) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 0, endColumnIndex: cols },
      cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { bold: true, foregroundColor: WHITE } } },
      fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat",
    },
  }
}

/**
 * Restructure: Ad Hoc Costs → Expenses log (typed, with source/receipt), delete duplicate and
 * superseded tabs, clear test ad data from Platform Data, reset the P&L tab, clear Close Index.
 */
export async function restructureTracker(admin: SupabaseClient) {
  const spreadsheetId = await resolveReconciliationSheetId(admin)
  const sheets = sheetsClient()
  const report: string[] = []
  let all = await tabs(sheets, spreadsheetId)
  const has = (t: string) => all.some((x) => x.title === t)
  const idOf = (t: string) => all.find((x) => x.title === t)?.sheetId

  // 1. Expenses log (migrate Ad Hoc Costs rows once).
  if (!has("Expenses")) {
    const migrated: (string | number)[][] = []
    if (has("Ad Hoc Costs")) {
      const old = await sheets.spreadsheets.values.get({ spreadsheetId, range: "'Ad Hoc Costs'!A3:F500" })
      for (const r of old.data.values ?? []) {
        if (!r[0] || !r[3]) continue
        migrated.push([r[0], r[1] ?? "", "Ad hoc", r[2] ?? "", r[3], "Manual", "", r[4] ?? ""])
      }
    }
    const add = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: "Expenses", gridProperties: { rowCount: 2000, columnCount: 9, frozenRowCount: 2 } } } }] },
    })
    const sheetId = add.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "'Expenses'!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          ["⬇ Log every actual business expense here (one row per charge). Type: Recurring = subscriptions/bills · Ad hoc = one-off · Ad platform = Meta/Google invoices · Other. Bank/invoice imports will land here too."],
          EXPENSES_HEADERS,
          ...migrated,
        ],
      },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "'Expenses'!I3",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [['=ARRAYFORMULA(IF(A3:A="","",TEXT(A3:A,"mmm yyyy")))']] },
    })
    const listRule = (values: readonly string[]) => ({
      condition: { type: "ONE_OF_LIST", values: values.map((v) => ({ userEnteredValue: v })) },
      showCustomUi: true,
      strict: true,
    })
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          headerStyle(sheetId, 1, 9),
          { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { italic: true }, wrapStrategy: "CLIP" } }, fields: "userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy" } },
          { setDataValidation: { range: { sheetId, startRowIndex: 2, endRowIndex: 2000, startColumnIndex: 2, endColumnIndex: 3 }, rule: listRule(EXPENSE_TYPES) } },
          { setDataValidation: { range: { sheetId, startRowIndex: 2, endRowIndex: 2000, startColumnIndex: 5, endColumnIndex: 6 }, rule: listRule(EXPENSE_SOURCES) } },
          { setDataValidation: { range: { sheetId, startRowIndex: 2, endRowIndex: 2000, startColumnIndex: 0, endColumnIndex: 1 }, rule: { condition: { type: "DATE_IS_VALID" }, strict: true } } },
          { repeatCell: { range: { sheetId, startRowIndex: 2, endRowIndex: 2000, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" } } }, fields: "userEnteredFormat.numberFormat" } },
          { repeatCell: { range: { sheetId, startRowIndex: 2, endRowIndex: 2000, startColumnIndex: 4, endColumnIndex: 5 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: '"$"#,##0.00' } } }, fields: "userEnteredFormat.numberFormat" } },
          { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 100 }, fields: "pixelSize" } },
          { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 220 }, fields: "pixelSize" } },
          { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 6, endIndex: 8 }, properties: { pixelSize: 240 }, fields: "pixelSize" } },
        ],
      },
    })
    report.push(`Created Expenses log (${migrated.length} rows migrated from Ad Hoc Costs)`)
    all = await tabs(sheets, spreadsheetId)
  }

  // 2. Fixed Costs = the recurring plan: style the header, freeze it.
  const fixedId = idOf("Fixed Costs")
  if (fixedId != null) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          headerStyle(fixedId, 0, 5),
          { updateSheetProperties: { properties: { sheetId: fixedId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
        ],
      },
    })
  }

  // 3. Delete superseded tabs (Expenses must exist before Ad Hoc Costs goes).
  const doomed = all.filter(
    (t) =>
      ["OpEx", "Monthly Summary", "Ad Hoc Costs"].includes(t.title) ||
      /^Recon \d{4}-\d{2}$/.test(t.title) ||
      /^Close_[A-Za-z]+_\d{4}$/.test(t.title)
  )
  if (doomed.length && has("Expenses")) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: doomed.map((t) => ({ deleteSheet: { sheetId: t.sheetId } })) },
    })
    report.push(`Deleted tabs: ${doomed.map((t) => t.title).join(", ")}`)
  }

  // 4. Clear test ad data and the old daily P&L table; reset Close Index.
  if (has("Platform Data")) {
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: "'Platform Data'!A1:AZ50000" })
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "'Platform Data'!A1",
      valueInputOption: "RAW",
      requestBody: { values: [[...CLEANED_HEADERS]] },
    })
    report.push("Cleared Platform Data (test rows) and reset its headers")
  }
  if (has("P&L Dashboard")) await sheets.spreadsheets.values.clear({ spreadsheetId, range: "'P&L Dashboard'!A1:Z2000" })
  if (has("Close Index")) await sheets.spreadsheets.values.clear({ spreadsheetId, range: "'Close Index'!A1:Z500" })

  // 5. Default monthly ad budget used as the close's forecast.
  const { data: budget } = await admin.from("platform_settings").select("key").eq("key", "finance_ad_budget_monthly_usd").maybeSingle()
  if (!budget) {
    await admin.from("platform_settings").insert({ key: "finance_ad_budget_monthly_usd", value: 3000 })
    report.push("Set monthly ad budget to $3,000 (platform_settings.finance_ad_budget_monthly_usd)")
  }

  await reorderTrackerTabs(sheets, spreadsheetId)
  return { spreadsheetId, report }
}

/** Rebuild Platform Data from real Meta history: find days with spend, then pull ad-level rows. */
export async function backfillPlatformData(admin: SupabaseClient, from: string, to: string) {
  const spreadsheetId = await resolveReconciliationSheetId(admin)
  const sheets = sheetsClient()
  const days = await fetchAccountDailySpend(from, to)
  let rows = 0
  for (const { date } of days.slice(0, 120)) {
    const metaRaw = await fetchMetaInsights(date, "purchase")
    if (!metaRaw.length) continue
    const normalized: RawRow[] = metaRaw.map((r) => ({ date, ...r, video_views_100pct: 0 }))
    const cleaned = normalized.map((r) => cleanRow(r, "Meta"))
    await upsertPlatformData(sheets, spreadsheetId, date, "Meta", cleaned)
    rows += cleaned.length
  }
  return {
    daysWithSpend: days.length,
    daysWritten: Math.min(days.length, 120),
    rows,
    totalSpend: Math.round(days.reduce((s, d) => s + d.spend, 0) * 100) / 100,
    truncated: days.length > 120,
  }
}
