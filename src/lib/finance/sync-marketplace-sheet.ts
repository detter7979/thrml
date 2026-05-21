import { google } from "googleapis"
import type { SupabaseClient } from "@supabase/supabase-js"

import { loadGoogleServiceAccountCredentials } from "@/lib/google-service-account"
import { rebuildFinanceTrackerFromAdmin } from "@/lib/finance/rebuild-finance-tracker"

import {
  DEFAULT_FINANCE_TRACKER_SHEET_ID,
  MARKETPLACE_DATA_TAB,
  resolveFinanceTrackerSheetId,
} from "@/lib/finance/sheet-config"

export { DEFAULT_FINANCE_TRACKER_SHEET_ID, MARKETPLACE_DATA_TAB, resolveFinanceTrackerSheetId }

type AdminClient = SupabaseClient

async function ensureMarketplaceTab(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string
) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const existing = meta.data.sheets?.find((s) => s.properties?.title === MARKETPLACE_DATA_TAB)
  if (existing?.properties?.sheetId != null) return

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: MARKETPLACE_DATA_TAB } } }],
    },
  })
}


export async function syncMarketplaceFinanceSheet(
  admin: AdminClient,
  spreadsheetId?: string
): Promise<{ rows: number; spreadsheetId: string }> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured")
  }

  const sheetId = spreadsheetId ?? resolveFinanceTrackerSheetId()

  const { data: snapshots, error } = await admin
    .from("finance_snapshots")
    .select("*")
    .order("snapshot_date", { ascending: true })

  if (error) throw error
  if (!snapshots?.length) {
    throw new Error("No finance_snapshots rows — run finance-rebuild-snapshots first")
  }

  const auth = new google.auth.GoogleAuth({
    credentials: loadGoogleServiceAccountCredentials(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  const sheets = google.sheets({ version: "v4", auth })

  await ensureMarketplaceTab(sheets, sheetId)

  const headers = [
    "Date",
    "Bookings",
    "Gross GMV",
    "Gross Take",
    "Cash Platform Rev",
    "Host Payouts",
    "Refunds",
    "Credits Applied",
    "Chargebacks",
    "Net Rev",
    "New Users",
  ]

  const rows = snapshots.map((s) => [
    s.snapshot_date,
    s.booking_count,
    Number(s.gross_booking_value).toFixed(2),
    Number(s.gross_platform_take ?? 0).toFixed(2),
    Number(s.platform_revenue).toFixed(2),
    Number(s.host_payouts).toFixed(2),
    Number(s.refunds_issued).toFixed(2),
    Number(s.credits_applied ?? 0).toFixed(2),
    Number(s.chargebacks ?? 0).toFixed(2),
    Number(s.net_platform_revenue).toFixed(2),
    s.new_users,
  ])

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `'${MARKETPLACE_DATA_TAB}'!A1:K1`,
    valueInputOption: "RAW",
    requestBody: { values: [headers] },
  })

  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: `'${MARKETPLACE_DATA_TAB}'!A2:K5000`,
  })

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `'${MARKETPLACE_DATA_TAB}'!A2:K${rows.length + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  })

  await rebuildFinanceTrackerFromAdmin(admin, sheetId)

  return { rows: rows.length, spreadsheetId: sheetId }
}
