/**
 * reconciler.mjs — thrml Monthly Close Agent
 *
 * Runs on the 1st of each month (or manually / via GitHub Action / CRON).
 * Performs a full monthly spend reconciliation against the Finance Tracker:
 *   1. Creates Drive folder structure: Finance Closes / YYYY / MM_Month /
 *   2. Creates (or updates) thrml_final_spend_summary_[Month_YYYY] sheet
 *   3. Pulls Actual Spend from Platform Data + Ad Hoc Costs + Fixed Costs
 *   4. Subtracts Credits + Invalid Activity adjustments
 *   5. Compares to Forecasted Spend (OpEx plan + ad budget)
 *   6. Writes a clean reconciliation summary + full line-item breakdown
 *
 * Usage:
 *   node scripts/reconciler.mjs                    # auto-detects prior month
 *   node scripts/reconciler.mjs --month 2026-04    # explicit month override
 *   node scripts/reconciler.mjs --dry-run          # validate without writing
 *
 * GitHub Actions / CRON: schedule "0 9 1 * *" (9am UTC on the 1st)
 */

import { google } from "googleapis"
import { readFileSync } from "fs"
import path from "path"

// ── Config ────────────────────────────────────────────────────────────────
const CONFIG = {
  // Google Sheets IDs
  FINANCE_TRACKER:  "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU",
  // Drive folder: "Finance Closes" root — create this once in Drive, paste ID here
  // If blank, reconciler writes to a top-level folder named "thrml / Finance Closes"
  FINANCE_CLOSES_ROOT: process.env.FINANCE_CLOSES_ROOT || "",
  // Planned ad budget per month (override via env or edit here per month)
  AD_BUDGET_MONTHLY: parseFloat(process.env.AD_BUDGET_MONTHLY || "5000"),
  // Creds path (falls back to env var GOOGLE_SERVICE_ACCOUNT_JSON)
  CREDS_PATH: process.env.GOOGLE_CREDENTIALS_PATH || "/tmp/gcp_creds.json",
  // Adjustment labels to subtract from actuals
  CREDIT_LABELS: ["credit", "invalid activity", "refund", "adjustment"],
}

// ── Colours ───────────────────────────────────────────────────────────────
const C = {
  ink:    { red:0.047, green:0.086, blue:0.157 },
  navy:   { red:0.078, green:0.133, blue:0.216 },
  teal:   { red:0.067, green:0.216, blue:0.176 },
  amber:  { red:0.600, green:0.400, blue:0.000 },
  red:    { red:0.720, green:0.110, blue:0.110 },
  green:  { red:0.067, green:0.490, blue:0.240 },
  white:  { red:1,     green:1,     blue:1     },
  accent: { red:0.651, green:0.761, blue:0.894 },
  row0:   { red:0.961, green:0.965, blue:0.976 },
  row1:   { red:0.984, green:0.984, blue:0.984 },
}
const USD   = { numberFormat:{ type:"CURRENCY", pattern:'"$"#,##0.00' } }
const PCT   = { numberFormat:{ type:"PERCENT",  pattern:'0.00%' } }
const DATE_F= { numberFormat:{ type:"DATE",     pattern:"yyyy-mm-dd" } }
const INT   = { numberFormat:{ type:"NUMBER",   pattern:"#,##0" } }

// ── Auth ──────────────────────────────────────────────────────────────────
function initAuth() {
  let creds
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  } else {
    creds = JSON.parse(readFileSync(CONFIG.CREDS_PATH, "utf8"))
  }
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  })
  return { auth, sheets: google.sheets({ version:"v4", auth }), drive: google.drive({ version:"v3", auth }) }
}

// ── CLI args ──────────────────────────────────────────────────────────────
function parseArgs() {
  const args  = process.argv.slice(2)
  const dry   = args.includes("--dry-run")
  const mFlag = args.indexOf("--month")
  let targetMonth // "YYYY-MM"

  if (mFlag !== -1 && args[mFlag+1]) {
    targetMonth = args[mFlag+1]
  } else {
    // Default: prior calendar month
    const d = new Date()
    d.setDate(1); d.setMonth(d.getMonth()-1)
    targetMonth = d.toISOString().slice(0,7)
  }
  const [year, month] = targetMonth.split("-").map(Number)
  const monthName = new Date(year, month-1, 1).toLocaleDateString("en-US",{month:"long"})
  const monthLabel = `${String(month).padStart(2,"0")}_${monthName}` // "04_April"
  const sheetName  = `thrml_final_spend_summary_${monthName}_${year}` // "thrml_final_spend_summary_April_2026"

  return { dry, year, month, monthName, monthLabel, sheetName, targetMonth }
}

// ── Date helpers ──────────────────────────────────────────────────────────
function monthRange(year, month) {
  const start = `${year}-${String(month).padStart(2,"0")}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2,"0")}-${lastDay}`
  return { start, end }
}

function inMonth(dateVal, year, month) {
  if (!dateVal && dateVal !== 0) return false
  let d
  if (typeof dateVal === "number") {
    // Google Sheets serial date (days since Dec 30, 1899)
    d = new Date(Date.UTC(1899, 11, 30) + dateVal * 86400000)
  } else {
    // ISO string "YYYY-MM-DD" or similar
    d = new Date(String(dateVal).slice(0,10) + "T12:00:00Z")
  }
  return !isNaN(d) && d.getUTCFullYear()===year && d.getUTCMonth()+1===month
}

// ── Drive folder helpers ──────────────────────────────────────────────────
async function getOrCreateFolder(drive, parentId, name) {
  const q = `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const res = await drive.files.list({ q, fields:"files(id,name)", spaces:"drive" })
  if (res.data.files?.length > 0) {
    console.log(`  ✓ Folder exists: ${name}/`)
    return res.data.files[0].id
  }
  const created = await drive.files.create({
    requestBody: { name, mimeType:"application/vnd.google-apps.folder", parents:[parentId] },
    fields: "id,name",
  })
  console.log(`  📁 Created folder: ${name}/`)
  return created.data.id
}

async function resolveClosesRoot(drive) {
  if (CONFIG.FINANCE_CLOSES_ROOT) return CONFIG.FINANCE_CLOSES_ROOT
  // Find or create "thrml Finance Closes" in Drive root
  const q = `name='thrml Finance Closes' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`
  const res = await drive.files.list({ q, fields:"files(id)" })
  if (res.data.files?.length > 0) return res.data.files[0].id
  const c = await drive.files.create({
    requestBody:{ name:"thrml Finance Closes", mimeType:"application/vnd.google-apps.folder" },
    fields:"id",
  })
  console.log(`  📁 Created root folder: thrml Finance Closes/`)
  return c.data.id
}

async function resolveTargetFolder(drive, year, monthLabel) {
  const root   = await resolveClosesRoot(drive)
  const yearId = await getOrCreateFolder(drive, root, String(year))
  return getOrCreateFolder(drive, yearId, monthLabel)
}

// ── Sheet helpers ─────────────────────────────────────────────────────────
async function upsertSummarySheet(sheets, drive, folderId, sheetName) {
  // Check if sheet already exists in folder
  const q = `'${folderId}' in parents and name='${sheetName}' and trashed=false`
  const res = await drive.files.list({ q, fields:"files(id)" })
  if (res.data.files?.length > 0) {
    console.log(`  ✓ Summary sheet exists, overwriting: ${sheetName}`)
    return res.data.files[0].id
  }
  try {
    const c = await drive.files.create({
      requestBody:{ name:sheetName, mimeType:"application/vnd.google-apps.spreadsheet", parents:[folderId] },
      fields:"id",
    })
    console.log(`  ✅ Created summary sheet: ${sheetName}`)
    return c.data.id
  } catch(e) {
    throw new Error(`Cannot create summary sheet '${sheetName}' — ensure the target folder is shared with the service account. ${e.message}`)
  }
}

// ── Data pullers ──────────────────────────────────────────────────────────

// Pull actual ad spend from Platform Data tab, filtered to target month
async function pullPlatformSpend(sheets, year, month) {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.FINANCE_TRACKER,
    range: "Platform Data!A1:Z2000",
    valueRenderOption: "UNFORMATTED_VALUE",
  })
  const [hdrs, ...rows] = r.data.values ?? []
  if (!hdrs) return { total:0, byPlatform:{}, byCampaign:[], credits:0 }

  const idx = Object.fromEntries(hdrs.map((h,i)=>[h,i]))
  const dateCol   = idx["Date"]
  const spendCol  = idx["Spend ($)"]
  const platCol   = idx["Platform"]
  const campCol   = idx["Campaign Name"]
  const noteCol   = idx["Notes"] ?? idx["Opt. Event"]

  const lineItems = []
  const byPlatform = {}
  let total = 0, credits = 0

  for (const row of rows) {
    if (!inMonth(row[dateCol], year, month)) continue
    const spend  = parseFloat(row[spendCol]) || 0
    const plat   = row[platCol] ?? "Unknown"
    const camp   = row[campCol] ?? "Unknown"
    const note   = String(row[noteCol] ?? "").toLowerCase()
    const isCredit = CONFIG.CREDIT_LABELS.some(l => note.includes(l))

    if (isCredit) {
      credits += Math.abs(spend)
    } else {
      total += spend
      byPlatform[plat] = (byPlatform[plat] || 0) + spend
    }
    lineItems.push({ date:row[dateCol], platform:plat, campaign:camp, spend, isCredit })
  }

  return { total, byPlatform, lineItems, credits }
}

// Pull fixed / recurring costs from Fixed Costs tab
async function pullFixedCosts(sheets) {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.FINANCE_TRACKER,
    range: "Fixed Costs!A1:E50",
    valueRenderOption: "UNFORMATTED_VALUE",
  })
  const [hdrs, ...rows] = r.data.values ?? []
  const idx = Object.fromEntries((hdrs??[]).map((h,i)=>[h.toString().trim(),i]))
  const items = [], monthly_col = idx["Monthly ($)"] ?? 2

  let total = 0
  for (const row of rows) {
    if (!row[0]) continue
    const amt = parseFloat(row[monthly_col]) || 0
    if (amt === 0) continue
    items.push({ item:row[0], category:row[1]??"", monthly:amt, notes:row[4]??"" })
    total += amt
  }
  return { total, items }
}

// Pull ad hoc / variable costs from Ad Hoc Costs tab, filtered to month
async function pullAdHocCosts(sheets, year, month) {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.FINANCE_TRACKER,
    range: "Ad Hoc Costs!A1:F200",
    valueRenderOption: "UNFORMATTED_VALUE",
  })
  const [hdrs, ...rows] = r.data.values ?? []
  const idx = Object.fromEntries((hdrs??[]).map((h,i)=>[h.toString().trim(),i]))
  const dateCol = idx["Date"] ?? 0
  const itemCol = idx["Item"] ?? 1
  const catCol  = idx["Category"] ?? 2
  const amtCol  = idx["Amount ($)"] ?? 3
  const noteCol = idx["Notes"] ?? 4

  let total = 0, credits = 0
  const items = []

  for (const row of rows) {
    if (!row[dateCol]) continue
    const dateStr = typeof row[dateCol]==="number"
      ? new Date(Date.UTC(1899,11,30)+row[dateCol]*86400000).toISOString().slice(0,10)
      : String(row[dateCol]).slice(0,10)
    if (!inMonth(dateStr, year, month)) continue

    const amt   = parseFloat(row[amtCol]) || 0
    const note  = String(row[noteCol]??"").toLowerCase()
    const item  = String(row[itemCol]??"")
    const isCredit = CONFIG.CREDIT_LABELS.some(l=>note.includes(l)||item.toLowerCase().includes(l))

    if (isCredit) { credits += Math.abs(amt) }
    else          { total += amt; items.push({ date:dateStr, item, category:row[catCol]??"", amount:amt }) }
  }
  return { total, credits, items }
}

// Pull OpEx plan (monthly forecast) from OpEx tab
async function pullOpExForecast(sheets) {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.FINANCE_TRACKER,
    range: "OpEx!A1:E30",
    valueRenderOption: "UNFORMATTED_VALUE",
  })
  const [hdrs, ...rows] = r.data.values ?? []
  let total = 0
  const items = []
  for (const row of rows) {
    if (!row[0]) continue
    const amt = parseFloat(row[1]) || 0
    if (String(row[1]).toLowerCase()==="variable") continue // skip variable rows
    if (amt===0) continue
    items.push({ item:row[0], monthly:amt, category:row[2]??"" })
    total += amt
  }
  return { total, items }
}

// ── Report writer ─────────────────────────────────────────────────────────
async function writeReconciliationReport(sheets, fileId, params, data) {
  const { monthName, year, targetMonth } = params
  const { platform, fixed, adhoc, opex, adBudget } = data
  const { start, end } = monthRange(year, params.month)

  // ── Reconciliation math ───────────────────────────────────────────────
  const totalCredits    = platform.credits + adhoc.credits
  const actualAdSpend   = platform.total                           // gross ad spend
  const adjustedAdSpend = Math.max(0, actualAdSpend - totalCredits) // after credits
  const actualFixed     = fixed.total
  const actualAdhoc     = adhoc.total
  const totalActual     = adjustedAdSpend + actualFixed + actualAdhoc

  const forecastAdSpend = adBudget
  const forecastFixed   = opex.total
  const forecastTotal   = forecastAdSpend + forecastFixed // (ad hoc not forecasted)

  const varianceTotal   = totalActual - forecastTotal
  const variancePct     = forecastTotal > 0 ? varianceTotal/forecastTotal : 0
  const isOverBudget    = varianceTotal > 0

  // ── Build sheet values ────────────────────────────────────────────────
  const now = new Date().toISOString().slice(0,10)
  const fmt2 = n => Number(n).toFixed(2)

  // Section 1 — Header / cover
  const header = [
    [`thrml — Monthly Spend Reconciliation`],
    [`${monthName} ${year}  |  ${start} → ${end}`],
    [`Generated: ${now}  |  Status: ${totalActual===0?"⚠️ ACTUALS NOT YET UPDATED":"✅ COMPLETE"}`],
    [``],
  ]

  // Section 2 — Summary table
  const summary = [
    [`CATEGORY`,              `FORECAST ($)`,     `ACTUAL ($)`,       `VARIANCE ($)`,     `VARIANCE %`,       `NOTES`],
    [`Ad Spend (Platform)`,   fmt2(forecastAdSpend), fmt2(adjustedAdSpend), fmt2(adjustedAdSpend-forecastAdSpend), ((adjustedAdSpend-forecastAdSpend)/Math.max(forecastAdSpend,1)), `After ${fmt2(totalCredits)} in credits/adjustments`],
    [`Fixed / OpEx`,          fmt2(forecastFixed), fmt2(actualFixed),  fmt2(actualFixed-forecastFixed), ((actualFixed-forecastFixed)/Math.max(forecastFixed,1)), `Recurring monthly costs`],
    [`Ad Hoc / Variable`,     `N/A`,              fmt2(actualAdhoc),  `N/A`,              `N/A`,              `One-time / variable costs`],
    [`Credits & Adjustments`, `—`,                fmt2(-totalCredits),`—`,                `—`,                `Subtracted from Ad Spend`],
    [``],
    [`TOTAL`,                 fmt2(forecastTotal), fmt2(totalActual),  fmt2(varianceTotal), variancePct,        isOverBudget?"🔴 OVER BUDGET":"🟢 UNDER BUDGET"],
  ]

  // Section 3 — Platform spend by platform
  const platBreakdown = [
    [`AD SPEND BY PLATFORM`,  `Actual ($)`, `% of Ad Spend`, ``, ``],
    ...Object.entries(platform.byPlatform).sort((a,b)=>b[1]-a[1]).map(([p,v])=>[
      p, fmt2(v), actualAdSpend>0?v/actualAdSpend:0, ``, ``
    ]),
    [`Gross (before credits)`, fmt2(actualAdSpend), 1, ``, ``],
    [`Credits / Invalid`,      fmt2(-totalCredits), ``, ``, `Subtracted`],
    [`Net Ad Spend`,           fmt2(adjustedAdSpend), ``, ``, ``],
  ]

  // Section 4 — Fixed costs line items
  const fixedLines = [
    [`FIXED COSTS LINE ITEMS`, `Monthly ($)`, `Category`, `Notes`, ``],
    ...fixed.items.map(i=>[i.item, fmt2(i.monthly), i.category, i.notes, ``]),
    [`TOTAL FIXED`, fmt2(actualFixed), ``, ``, ``],
  ]

  // Section 5 — Ad hoc line items
  const adhocLines = [
    [`AD HOC / VARIABLE COSTS`, `Date`, `Amount ($)`, `Category`, `Notes`],
    ...(adhoc.items.length > 0
      ? adhoc.items.map(i=>[i.item, i.date, fmt2(i.amount), i.category, ``])
      : [[`No ad hoc costs recorded for ${monthName} ${year}`, ``, ``, ``, ``]]),
    [`TOTAL AD HOC`, ``, fmt2(actualAdhoc), ``, ``],
  ]

  // Stitch into one write
  const BLANK = [[``]]
  const allRows = [
    ...header,
    ...summary, ...BLANK,
    ...platBreakdown, ...BLANK,
    ...fixedLines, ...BLANK,
    ...adhocLines,
  ]

  await sheets.spreadsheets.values.clear({ spreadsheetId:fileId, range:"Sheet1!A1:Z500" })
  await sheets.spreadsheets.values.update({
    spreadsheetId:fileId, range:"Sheet1!A1",
    valueInputOption:"USER_ENTERED",
    requestBody:{ values:allRows },
  })

  return {
    rowCount: allRows.length,
    summary: { forecastTotal, totalActual, varianceTotal, variancePct, isOverBudget, totalCredits },
    sectionStarts: {
      header: 1, summary: header.length+1,
      platform: header.length+summary.length+2,
      fixed: header.length+summary.length+platBreakdown.length+4,
    }
  }
}

// ── Formatting ────────────────────────────────────────────────────────────
async function applyFormatting(sheets, fileId, sectionStarts, isOverBudget) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId:fileId })
  const sid  = meta.data.sheets?.[0]?.properties?.sheetId ?? 0
  const cc   = (r1,r2,c1,c2,f) => ({
    repeatCell:{
      range:{sheetId:sid,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2},
      cell:{userEnteredFormat:f},
      fields:Object.keys(f).map(k=>`userEnteredFormat(${k})`).join(","),
    }
  })
  const cw   = (a,b,px) => ({updateDimensionProperties:{range:{sheetId:sid,dimension:"COLUMNS",startIndex:a,endIndex:b},properties:{pixelSize:px},fields:"pixelSize"}})
  const rh   = (a,b,px) => ({updateDimensionProperties:{range:{sheetId:sid,dimension:"ROWS",startIndex:a,endIndex:b},properties:{pixelSize:px},fields:"pixelSize"}})
  const merge= (r1,r2,c1,c2) => ({mergeCells:{range:{sheetId:sid,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2},mergeType:"MERGE_ALL"}})

  const {summary:sRow} = sectionStarts
  const varRow = sRow - 1 + 7 // TOTAL row in summary section

  await sheets.spreadsheets.batchUpdate({ spreadsheetId:fileId, requestBody:{ requests:[
    // Freeze row 4 (after cover rows)
    {updateSheetProperties:{properties:{sheetId:sid,gridProperties:{frozenRowCount:4}},fields:"gridProperties.frozenRowCount"}},
    // Title row
    cc(0,1,0,6,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:18},verticalAlignment:"MIDDLE",padding:{top:16,bottom:16}}),
    cc(1,2,0,6,{backgroundColor:C.navy,textFormat:{foregroundColor:C.accent,fontSize:11},horizontalAlignment:"LEFT"}),
    cc(2,3,0,6,{backgroundColor:C.navy,textFormat:{foregroundColor:C.accent,italic:true,fontSize:10},horizontalAlignment:"LEFT"}),
    rh(0,1,52), rh(1,2,24), rh(2,3,20), rh(3,4,10),
    // Summary section header row
    cc(sRow-1,sRow,0,6,{backgroundColor:C.teal,textFormat:{foregroundColor:C.white,bold:true,fontSize:11},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}),
    rh(sRow-1,sRow,30),
    // Summary data rows — alternating
    cc(sRow,sRow+3,0,6,{backgroundColor:C.row0,textFormat:{fontSize:10}}),
    cc(sRow+1,sRow+2,0,6,{backgroundColor:C.row1,textFormat:{fontSize:10}}),
    cc(sRow+3,sRow+4,0,6,{backgroundColor:C.row1,textFormat:{fontSize:10}}),
    // TOTAL row
    cc(varRow-1,varRow,0,6,{backgroundColor:isOverBudget?C.red:C.green,textFormat:{foregroundColor:C.white,bold:true,fontSize:11},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}),
    rh(varRow-1,varRow,30),
    // Number formats on summary cols B-E
    cc(sRow,varRow,1,2,USD), cc(sRow,varRow,2,3,USD), cc(sRow,varRow,3,4,USD), cc(sRow,varRow,4,5,PCT),
    cc(varRow-1,varRow,1,2,USD),cc(varRow-1,varRow,2,3,USD),cc(varRow-1,varRow,3,4,USD),cc(varRow-1,varRow,4,5,PCT),
    // Column widths
    cw(0,1,240), cw(1,2,120), cw(2,3,120), cw(3,4,120), cw(4,5,100), cw(5,6,260),
  ]}})
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  const params = parseArgs()
  const { dry, year, month, monthName, monthLabel, sheetName, targetMonth } = params
  const { start, end } = monthRange(year, month)

  console.log(`\n🧮  thrml Monthly Close Reconciler`)
  console.log(`    Period : ${monthName} ${year}  (${start} → ${end})`)
  console.log(`    Mode   : ${dry ? "DRY RUN — no writes" : "LIVE"}`)
  console.log(`    Budget : $${CONFIG.AD_BUDGET_MONTHLY.toLocaleString()} ad spend forecast\n`)

  const { sheets, drive } = initAuth()

  // ── 1. Pull all data ────────────────────────────────────────────────────
  console.log("📊 Pulling Finance Tracker data...")
  const [platform, fixed, adhoc, opex] = await Promise.all([
    pullPlatformSpend(sheets, year, month),
    pullFixedCosts(sheets),
    pullAdHocCosts(sheets, year, month),
    pullOpExForecast(sheets),
  ])

  // ── 2. Error guard — no actuals yet ────────────────────────────────────
  if (platform.total === 0 && adhoc.total === 0) {
    console.warn(`\n⚠️  WARNING: No actuals found for ${monthName} ${year}.`)
    console.warn(`   Platform Data and Ad Hoc Costs appear empty for this period.`)
    console.warn(`   If this is the 1st of the month, actuals may not be updated yet.`)
    if (dry) { console.log("\nDry run complete — would abort due to missing actuals."); return }
    console.warn(`   Proceeding with zeros — update the Finance Tracker and re-run.\n`)
  }

  // ── 3. Log reconciliation preview ──────────────────────────────────────
  const adBudget = CONFIG.AD_BUDGET_MONTHLY
  const adjusted = Math.max(0, platform.total - platform.credits - adhoc.credits)
  const total    = adjusted + fixed.total + adhoc.total
  const forecast = adBudget + opex.total
  const variance = total - forecast

  console.log(`\n📋 Reconciliation preview:`)
  console.log(`   Ad Spend (gross)     : $${platform.total.toFixed(2)}`)
  console.log(`   Credits / Adjustments: -$${(platform.credits+adhoc.credits).toFixed(2)}`)
  console.log(`   Ad Spend (net)       : $${adjusted.toFixed(2)}`)
  console.log(`   Fixed Costs          : $${fixed.total.toFixed(2)}`)
  console.log(`   Ad Hoc Costs         : $${adhoc.total.toFixed(2)}`)
  console.log(`   ─────────────────────────────────────`)
  console.log(`   Total Actual         : $${total.toFixed(2)}`)
  console.log(`   Total Forecast       : $${forecast.toFixed(2)}`)
  console.log(`   Variance             : ${variance>=0?"▲":""} $${Math.abs(variance).toFixed(2)} ${variance>0?"over":"under"} budget`)
  console.log(`   Status               : ${variance>0?"🔴 OVER BUDGET":"🟢 ON/UNDER BUDGET"}\n`)

  if (dry) { console.log("✅ Dry run complete — no Drive writes performed."); return }

  // ── 4. Resolve Drive folder structure ──────────────────────────────────
  console.log(`📁 Setting up Drive folder: Finance Closes / ${year} / ${monthLabel}/`)
  const folderId = await resolveTargetFolder(drive, year, monthLabel)

  // ── 5. Create / update the summary sheet ───────────────────────────────
  console.log(`\n📄 Upserting summary sheet: ${sheetName}`)
  const fileId = await upsertSummarySheet(sheets, drive, folderId, sheetName)

  // ── 6. Write reconciliation data ────────────────────────────────────────
  console.log(`\n✍️  Writing reconciliation data...`)
  const result = await writeReconciliationReport(sheets, fileId, params, {
    platform, fixed, adhoc, opex, adBudget,
  })

  // ── 7. Apply formatting ─────────────────────────────────────────────────
  console.log(`🎨 Applying formatting...`)
  await applyFormatting(sheets, fileId, result.sectionStarts, result.summary.isOverBudget)

  console.log(`\n✅  Monthly close complete`)
  console.log(`    Sheet  : ${sheetName}`)
  console.log(`    Rows   : ${result.rowCount}`)
  console.log(`    Status : ${result.summary.isOverBudget?"🔴 OVER BUDGET — review variance":"🟢 UNDER BUDGET"}`)
  console.log(`    Link   : https://docs.google.com/spreadsheets/d/${fileId}\n`)
}

main().catch(e => {
  console.error(`\n❌ Reconciler failed: ${e.message}`)
  if (process.env.CI) process.exit(1)  // fail GitHub Action
})
