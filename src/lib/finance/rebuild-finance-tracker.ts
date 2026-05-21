import { google } from "googleapis"
import type { SupabaseClient } from "@supabase/supabase-js"

import { loadGoogleServiceAccountCredentials } from "@/lib/google-service-account"
import {
  fx,
  pctOfGmv,
  periodRow,
  PERIODS,
  runRateAnnual,
  runRateMonthly,
  sumPlatformCol,
} from "@/lib/finance/sheet-formulas"
import {
  DEFAULT_FINANCE_TRACKER_SHEET_ID,
  resolveFinanceTrackerSheetId,
} from "@/lib/finance/sheet-config"

type AdminClient = SupabaseClient

const PNL_TAB = "P&L Dashboard"
const EXEC_TAB = "Executive Summary"

async function ensureTab(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  title: string
) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const existing = meta.data.sheets?.find((s) => s.properties?.title === title)
  if (existing?.properties?.sheetId != null) return existing.properties.sheetId

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  })
  return res.data.replies?.[0]?.addSheet?.properties?.sheetId ?? null
}

function refundsRow(label: string) {
  const md = `'Marketplace Data'`
  const sumRefunds = (start: string, end: string) =>
    fx(
      `IFERROR(-(SUMIFS(${md}!G:G,${md}!A:A,">="&${start},${md}!A:A,"<="&${end})+SUMIFS(${md}!I:I,${md}!A:A,">="&${start},${md}!A:A,"<="&${end})),0)`
    )
  const { mtdStart, last30Start, last90Start, ytdStart, today } = PERIODS
  return [
    label,
    sumRefunds(mtdStart, today),
    sumRefunds(last30Start, today),
    sumRefunds(last90Start, today),
    sumRefunds(ytdStart, today),
    "",
    "Marketplace Data · refunds + chargebacks",
  ]
}

function buildPnLDashboardRows() {
  const rows: (string | number)[][] = [
    ["thrml — P&L Dashboard", "", "", "", "", "", ""],
    [
      fx(
        `CONCATENATE("Updated ",TEXT(NOW(),"M/D/YYYY h:mm AM/PM")," · Marketplace + ad spend + manual costs")`
      ),
      "",
      "",
      "",
      "",
      "",
      "",
    ],
    [""],
    ["Line Item", "MTD", "Last 30 Days", "Last 90 Days", "YTD", "% of GMV (MTD)", "Source"],
    [""],
    ["▌ REVENUE (Marketplace)", "", "", "", "", "", ""],
    periodRow("  Gross Booking Value (GMV)", "C", "Marketplace Data · guest cash"),
    periodRow("  Gross Platform Take (fees)", "D", "Guest + host fees"),
    periodRow("  Cash Platform Revenue", "E", "Guest paid − host payout"),
    refundsRow("  Refunds & Chargebacks"),
    periodRow("  Net Platform Revenue", "J", "Marketplace Data · net after refunds"),
    periodRow("  Host Payouts (pass-through)", "F", "Paid to hosts — informational", {
      negate: true,
    }),
    periodRow("  Promo Credits Applied", "H", "Platform subsidy", { negate: true }),
    [""],
    ["▌ EXPENSES", "", "", "", "", "", ""],
    periodRow("  Fixed OpEx", "", "Fixed Costs tab", { isFixed: true, negate: true }),
    periodRow("  Ad Hoc / Variable", "", "Ad Hoc Costs tab", { isAdHoc: true, negate: true }),
    periodRow("  Paid Media (Ad Spend)", "AB", "Platform Data · Spend ($)", {
      isPlatform: true,
      negate: true,
    }),
    [
      "  Total Expenses",
      fx(`B16+B17+B18`),
      fx(`C16+C17+C18`),
      fx(`D16+D17+D18`),
      fx(`E16+E17+E18`),
      pctOfGmv("B19", "$B$7"),
      "Fixed + ad hoc + ads",
    ],
    [""],
    [
      "▌ NET CONTRIBUTION",
      fx(`B11+B13+B16+B17+B18`),
      fx(`C11+C13+C16+C17+C18`),
      fx(`D11+D13+D16+D17+D18`),
      fx(`E11+E13+E16+E17+E18`),
      pctOfGmv("B21", "$B$7"),
      "Net rev − promo − opex − ads",
    ],
    [""],
    ["▌ UNIT ECONOMICS (MTD)", "Value", "Target", "Status", "", "", ""],
    [
      "  Bookings",
      fx(
        `IFERROR(SUMIFS('Marketplace Data'!B:B,'Marketplace Data'!A:A,">="&${PERIODS.mtdStart},'Marketplace Data'!A:A,"<="&${PERIODS.today}),0)`
      ),
      "5",
      fx(`IFERROR(IF(B24>=5,"✅","⚠️"),"—")`),
      "",
      "",
      "Confirmed/completed",
    ],
    [
      "  GBV per Booking",
      fx(`IFERROR(B7/B24,0)`),
      "$35.00",
      fx(`IFERROR(IF(B25>=35,"✅","⚠️"),"—")`),
      "",
      "",
      "GMV ÷ bookings",
    ],
    [
      "  ROAS (net rev ÷ ad spend)",
      fx(`IFERROR(B11/ABS(B18),0)`),
      "1.5",
      fx(`IFERROR(IF(B26>=1.5,"✅","⚠️"),"—")`),
      "",
      "",
      "Higher is better",
    ],
    [
      "  CPA (ad spend ÷ bookings)",
      fx(`IFERROR(ABS(B18)/B24,0)`),
      "$80.00",
      fx(`IFERROR(IF(B27<=80,"✅","⚠️"),"—")`),
      "",
      "",
      "Lower is better",
    ],
  ]

  // % of GMV for revenue + promo rows (col F)
  for (const rowNum of [7, 8, 9, 10, 11, 13]) {
    const idx = rowNum - 1
    if (rows[idx]) rows[idx][5] = pctOfGmv(`B${rowNum}`, "$B$7")
  }

  return rows
}

function buildExecutiveSummaryRows() {
  const p = `'${PNL_TAB}'!`
  const adSpendMtd = sumPlatformCol("AB", PERIODS.mtdStart, PERIODS.today)

  return [
    ["thrml — Executive Summary", "", "", "", ""],
    [
      fx(
        `CONCATENATE(TEXT(TODAY(),"MMMM YYYY"),"  |  MTD through ",TEXT(TODAY(),"M/D/YYYY"),"  |  Live data")`
      ),
      "",
      "",
      "",
      "",
    ],
    [""],
    ["▌ KEY METRICS AT A GLANCE (MTD)", "", "", "", ""],
    [""],
    [
      "Total Ad Spend",
      "Host Clicks (P1)",
      "Host Onboarding (P2)",
      "Listings Created (P3)",
      "Purchases (Guest)",
    ],
    [
      adSpendMtd,
      sumPlatformCol("AF", PERIODS.mtdStart, PERIODS.today),
      sumPlatformCol("AG", PERIODS.mtdStart, PERIODS.today),
      sumPlatformCol("AH", PERIODS.mtdStart, PERIODS.today),
      sumPlatformCol("AI", PERIODS.mtdStart, PERIODS.today),
    ],
    [""],
    ["▌ PROFIT & LOSS", "MTD Actual", "Month Run-Rate", "Annual Run-Rate", "Notes"],
    [""],
    ["REVENUE", "", "", "", ""],
    [
      "  Gross Booking Value",
      fx(`${p}B7`),
      runRateMonthly("B12"),
      runRateAnnual("B12"),
      "From P&L Dashboard",
    ],
    [
      "  Gross Platform Take",
      fx(`${p}B8`),
      runRateMonthly("B13"),
      runRateAnnual("B13"),
      "Guest + host fees",
    ],
    [
      "  Cash Platform Revenue",
      fx(`${p}B9`),
      runRateMonthly("B14"),
      runRateAnnual("B14"),
      "Before refunds",
    ],
    [
      "  Refunds & Chargebacks",
      fx(`${p}B10`),
      runRateMonthly("B15"),
      runRateAnnual("B15"),
      "financial_events",
    ],
    [
      "  Net Platform Revenue",
      fx(`${p}B11`),
      runRateMonthly("B16"),
      runRateAnnual("B16"),
      "Marketplace net",
    ],
    [
      "  Host Payouts",
      fx(`${p}B12`),
      runRateMonthly("B17"),
      runRateAnnual("B17"),
      "Pass-through",
    ],
    [
      "  Promo Credits",
      fx(`${p}B13`),
      runRateMonthly("B18"),
      runRateAnnual("B18"),
      "Platform subsidy",
    ],
    [""],
    ["EXPENSES", "", "", "", ""],
    [
      "  Fixed OpEx",
      fx(`${p}B16`),
      runRateMonthly("B21"),
      runRateAnnual("B21"),
      "Fixed Costs tab",
    ],
    [
      "  Ad Hoc / Variable",
      fx(`${p}B17`),
      runRateMonthly("B22"),
      runRateAnnual("B22"),
      "Ad Hoc Costs tab",
    ],
    [
      "  Paid Media",
      fx(`${p}B18`),
      runRateMonthly("B23"),
      runRateAnnual("B23"),
      "Platform Data · MTD filtered",
    ],
    [
      "  Total Expenses",
      fx(`${p}B19`),
      runRateMonthly("B24"),
      runRateAnnual("B24"),
      "",
    ],
    [""],
    [
      "NET CONTRIBUTION",
      fx(`${p}B21`),
      runRateMonthly("B27"),
      runRateAnnual("B27"),
      "Net rev − promo − opex − ads",
    ],
    [
      "Profit Margin",
      fx(`IFERROR(B26/ABS(B16),0)`),
      fx(`IFERROR(C26/ABS(C16),0)`),
      fx(`IFERROR(D26/ABS(D16),0)`),
      "% of net platform revenue",
    ],
    [""],
    ["▌ UNIT ECONOMICS", "Value", "Target", "Status", "Notes"],
    [""],
    [
      "  GBV per Booking",
      fx(`${p}B25`),
      "$35.00",
      fx(`${p}D25`),
      "From P&L Dashboard",
    ],
    [
      "  # Bookings (MTD)",
      fx(`${p}B24`),
      "5",
      fx(`${p}D24`),
      "Confirmed/completed",
    ],
    [
      "  ROAS",
      fx(`${p}B26`),
      "1.5×",
      fx(`${p}D26`),
      "Net rev ÷ ad spend",
    ],
    [
      "  CPA (Cost Per Booking)",
      fx(`${p}B27`),
      "$80.00",
      fx(`${p}D27`),
      "Ad spend ÷ bookings",
    ],
  ]
}

export async function syncPlatformDataFromMasterReport(
  sheets: ReturnType<typeof google.sheets>,
  financeTrackerId: string,
  masterReportId: string
): Promise<number> {
  const source = await sheets.spreadsheets.values.get({
    spreadsheetId: masterReportId,
    range: "Platform Data!A1:AZ50000",
  })
  const values = source.data.values ?? []
  if (values.length < 2) return 0

  await sheets.spreadsheets.values.clear({
    spreadsheetId: financeTrackerId,
    range: "Platform Data!A1:AZ50000",
  })

  await sheets.spreadsheets.values.update({
    spreadsheetId: financeTrackerId,
    range: "Platform Data!A1",
    valueInputOption: "RAW",
    requestBody: { values },
  })

  return values.length - 1
}

export async function rebuildFinanceTrackerTabs(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string
) {
  await ensureTab(sheets, spreadsheetId, PNL_TAB)
  await ensureTab(sheets, spreadsheetId, EXEC_TAB)

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${PNL_TAB}'!A1:G50`,
  })
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${PNL_TAB}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: buildPnLDashboardRows() },
  })

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${EXEC_TAB}'!A1:E50`,
  })
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${EXEC_TAB}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: buildExecutiveSummaryRows() },
  })
}

export async function rebuildFinanceTrackerFromAdmin(
  admin: AdminClient,
  spreadsheetId?: string
) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured")
  }

  const sheetId = spreadsheetId ?? resolveFinanceTrackerSheetId()
  const auth = new google.auth.GoogleAuth({
    credentials: loadGoogleServiceAccountCredentials(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  const sheets = google.sheets({ version: "v4", auth })

  const { data: settings } = await admin
    .from("platform_settings")
    .select("key, value")
    .in("key", ["gdrive_master_report_id"])

  const masterRaw = settings?.find((s) => s.key === "gdrive_master_report_id")?.value
  let platformRows = 0
  if (masterRaw) {
    const masterId = String(masterRaw).replace(/^"|"$/g, "")
    try {
      platformRows = await syncPlatformDataFromMasterReport(sheets, sheetId, masterId)
    } catch (err) {
      console.error("[finance/rebuild] Master Report Platform Data sync failed", err)
    }
  }

  await rebuildFinanceTrackerTabs(sheets, sheetId)

  return { spreadsheetId: sheetId, platformRowsSynced: platformRows }
}

export { DEFAULT_FINANCE_TRACKER_SHEET_ID }
