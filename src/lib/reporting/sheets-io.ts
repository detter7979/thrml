/** Small Google Sheets helpers shared by the unified report and the Master Report. */
import { ensureTabExists, type SheetsClient } from "@/lib/agent/google-sheets-client"

type Cell = string | number

export async function writeTab(sheets: SheetsClient, spreadsheetId: string, tab: string, values: Cell[][]) {
  await ensureTabExists(sheets, spreadsheetId, tab)
  const esc = tab.replace(/'/g, "''")
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${esc}'` })
  const chunk = 5000
  for (let i = 0; i < Math.max(values.length, 1); i += chunk) {
    const slice = values.slice(i, i + chunk)
    if (!slice.length) break
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${esc}'!A${i + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: slice },
    })
  }
}

/** Drop the default empty "Sheet1" once our tabs exist, and freeze the header row. */
export async function tidy(sheets: SheetsClient, spreadsheetId: string, tabs: string[]) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" })
  const props = (meta.data.sheets ?? []).map((s) => s.properties!)
  const requests: object[] = []
  for (const p of props) {
    if (tabs.includes(p.title!)) {
      requests.push({
        updateSheetProperties: { properties: { sheetId: p.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" },
      })
    }
  }
  const sheet1 = props.find((p) => p.title === "Sheet1")
  if (sheet1 && props.length > 1) requests.push({ deleteSheet: { sheetId: sheet1.sheetId } })
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
}

