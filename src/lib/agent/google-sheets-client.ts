import { google } from "googleapis"
import type { sheets_v4 } from "googleapis"

import { loadGoogleServiceAccountCredentials } from "@/lib/google-service-account"

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"

export type SheetsClient = sheets_v4.Sheets

export function getNamerSheetId(): string {
  const id = process.env.NAMER_SHEET_ID?.trim()
  if (!id) throw new Error("NAMER_SHEET_ID is not set")
  return id
}

export function createGoogleSheetsClient(): SheetsClient {
  const auth = new google.auth.GoogleAuth({
    credentials: loadGoogleServiceAccountCredentials(),
    scopes: [SHEETS_SCOPE],
  })
  return google.sheets({ version: "v4", auth })
}

export async function listSpreadsheetTabs(
  sheets: SheetsClient,
  spreadsheetId: string
): Promise<string[]> {
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" })
  return (res.data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t))
}

/** Resolve tab title by substring match (e.g. "Campaign Builder"). */
export function resolveTabTitle(tabTitles: string[], ...candidates: string[]): string | null {
  for (const c of candidates) {
    const exact = tabTitles.find((t) => t === c)
    if (exact) return exact
  }
  for (const c of candidates) {
    const partial = tabTitles.find((t) => t.toLowerCase().includes(c.toLowerCase()))
    if (partial) return partial
  }
  return null
}

export async function readSheetValues(
  sheets: SheetsClient,
  spreadsheetId: string,
  tabTitle: string,
  rangeA1 = "A1:ZZ500"
): Promise<string[][]> {
  const range = `'${tabTitle.replace(/'/g, "''")}'!${rangeA1}`
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range })
  return (res.data.values ?? []).map((row) => row.map((c) => String(c ?? "")))
}

/** One batchUpdate for many cell writes on a tab. */
export async function batchWriteCells(
  sheets: SheetsClient,
  spreadsheetId: string,
  updates: { range: string; values: string[][] }[]
) {
  if (!updates.length) return
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: updates.map((u) => ({ range: u.range, values: u.values })),
    },
  })
}

/** Replace entire tab body (used for Unmatched). */
export async function replaceTabValues(
  sheets: SheetsClient,
  spreadsheetId: string,
  tabTitle: string,
  values: string[][]
) {
  const escaped = tabTitle.replace(/'/g, "''")
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${escaped}'!A:ZZ`,
  })
  if (!values.length) return
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${escaped}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  })
}

export async function ensureTabExists(
  sheets: SheetsClient,
  spreadsheetId: string,
  tabTitle: string
): Promise<void> {
  const titles = await listSpreadsheetTabs(sheets, spreadsheetId)
  if (titles.includes(tabTitle)) return
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: tabTitle } } }],
    },
  })
}

/** Convert 0-based column index to A1 letter(s). */
export function columnToLetter(col: number): string {
  let n = col + 1
  let s = ""
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function a1Range(tabTitle: string, col: number, row1Based: number): string {
  const escaped = tabTitle.replace(/'/g, "''")
  return `'${escaped}'!${columnToLetter(col)}${row1Based}`
}
